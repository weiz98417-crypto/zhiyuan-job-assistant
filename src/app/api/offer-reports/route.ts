import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDataRepositories } from "@/lib/data-repositories";
import { evaluateOfferSnapshot } from "@/lib/offer-evaluation";
import { offerLatestReportMatches, offerReportReadBackMatches } from "@/lib/offer-persistence-verifier";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    const body = await request.json();
    const {
      title,
      offers_json,
      report_markdown,
      report_type,
      model_version,
      offer_id,
      offer_snapshot,
      overall_score,
      verdict,
      summary,
      modules_json,
      red_flags_json,
      missing_info_json,
      negotiation_levers_json,
      hr_questions_json,
      assumptions_json,
      take_home_json,
    } = body;

    if (!report_markdown || typeof report_markdown !== "string") {
      return NextResponse.json({ success: false, error: "report_markdown is required" }, { status: 400 });
    }

    const offersArr = Array.isArray(offers_json) ? offers_json : JSON.parse(offers_json || "[]");
    const numOffers = offersArr.length;
    const snapshot = offer_snapshot || (offersArr.length === 1 ? offersArr[0] : {});
    const evaluated = snapshot?.company && snapshot?.role ? evaluateOfferSnapshot(snapshot) : null;
    const titleStr = title || (evaluated ? `${evaluated.company} Offer 评估报告` : "Offer report");

    const reportInput = {
      title: titleStr,
      report_type: report_type || (numOffers > 1 ? "comparison" : "single"),
      model_version: model_version || evaluated?.modelVersion || "",
      offer_id: offer_id ?? evaluated?.offerId ?? null,
      overall_score: overall_score ?? evaluated?.overallScore ?? 0,
      verdict: verdict ?? evaluated?.verdict ?? "",
      summary: summary ?? evaluated?.summary ?? "",
      offer_snapshot_json: snapshot || evaluated?.offerSnapshot || {},
      modules_json: modules_json ?? evaluated?.modules ?? [],
      red_flags_json: red_flags_json ?? evaluated?.redFlags ?? [],
      missing_info_json: missing_info_json ?? evaluated?.missingInfo ?? [],
      negotiation_levers_json: negotiation_levers_json ?? evaluated?.negotiationLevers ?? [],
      hr_questions_json: hr_questions_json ?? evaluated?.hrQuestions ?? [],
      assumptions_json: assumptions_json ?? evaluated?.assumptions ?? [],
      take_home_json: take_home_json ?? evaluated?.takeHomeEstimate ?? {},
      offers_json: offersArr,
      report_markdown,
      num_offers: numOffers,
    };

    const repos = getDataRepositories();
    const id = await repos.offerReports.insert(reportInput, user.userId);
    const readBack = await repos.offerReports.get(id, user.userId);
    const readBackVerified = offerReportReadBackMatches(readBack, reportInput, id);
    const linkedOfferReadBackVerified = reportInput.offer_id
      ? offerLatestReportMatches(await repos.offers.get(Number(reportInput.offer_id), user.userId), id)
      : true;

    if (!readBackVerified || !linkedOfferReadBackVerified) {
      return NextResponse.json({
        success: false,
        error: "Offer 评估报告持久化后回读校验失败，已阻止成功提示",
        data: { id, readBackVerified, linkedOfferReadBackVerified },
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id, readBackVerified, linkedOfferReadBackVerified } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    const rows = await getDataRepositories().offerReports.list(user.userId);
    return NextResponse.json({ success: true, data: rows });
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
