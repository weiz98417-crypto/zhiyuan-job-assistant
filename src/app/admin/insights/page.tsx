"use client";

import { useEffect, useState } from "react";
import type { TeamInsights } from "@/lib/team-insights";

const severityColor: Record<string, string> = {
  critical: "#dc2626",
  warning: "#d97706",
  info: "var(--color-muted)",
};

export default function AdminInsightsPage() {
  const [data, setData] = useState<TeamInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/insights", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "没有团队洞察权限" : "团队洞察加载失败");
        return r.json();
      })
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "团队洞察加载失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <CenteredText>正在加载团队洞察...</CenteredText>;
  }

  if (error || !data) {
    return <CenteredText>{error || "团队洞察加载失败，请刷新重试"}</CenteredText>;
  }

  const { overview, pipelineFunnel, marketSignals, bottlenecks, agentQuality, sharedAssets, actionRecommendations } = data;
  const maxFunnel = Math.max(1, ...pipelineFunnel.map((item) => item.count));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--color-text)]">
          团队洞察
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          团队求职情报和质量驾驶舱，只展示聚合与脱敏数据。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="活跃成员" value={overview.totalUsers} />
        <Metric label="本周活跃" value={overview.activeThisWeek} />
        <Metric label="追踪岗位" value={overview.totalApplications} />
        <Metric label="评估报告" value={overview.totalReports} />
        <Metric label="平均评分" value={overview.averageScore || "-"} />
      </div>

      <Panel title="Pipeline 漏斗">
        {pipelineFunnel.every((item) => item.count === 0) ? (
          <EmptyState text="还没有足够的 Pipeline 数据。后续 JD 入库、评估、追踪和投递会在这里形成漏斗。" />
        ) : (
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
            {pipelineFunnel.map((item) => (
              <div key={item.stage} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                <div className="text-xs text-[var(--color-muted)]">{item.label}</div>
                <div className="mt-1 text-2xl font-bold text-[var(--color-text)]">{item.count}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-divider)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${Math.max(6, (item.count / maxFunnel) * 100)}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] text-[var(--color-muted)]">
                  {item.rateFromPrevious === null ? "起点" : `${item.rateFromPrevious}% 上一阶段转化`}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="市场方向">
          <ListEmpty show={marketSignals.directions.length === 0} text="暂无方向数据">
            {marketSignals.directions.map((item) => (
              <Row key={item.name} left={item.name} right={`${item.count} 个 / 均分 ${item.averageScore || "-"}`}>
                {item.highRiskCount > 0 && <span className="text-xs text-red-500">高风险 {item.highRiskCount}</span>}
              </Row>
            ))}
          </ListEmpty>
        </Panel>

        <Panel title="来源分布">
          <ListEmpty show={marketSignals.sources.length === 0} text="暂无来源数据">
            {marketSignals.sources.map((item) => (
              <Row key={item.source} left={item.source} right={`${item.count} 个`} />
            ))}
          </ListEmpty>
        </Panel>

        <Panel title="城市信号">
          <ListEmpty show={marketSignals.cities.length === 0} text="暂无城市数据">
            {marketSignals.cities.map((item) => (
              <Row key={item.city} left={item.city} right={`${item.count} 个`} />
            ))}
          </ListEmpty>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="流程卡点">
          <div className="space-y-3">
            {bottlenecks.map((item) => (
              <div key={item.key} className="rounded-[var(--radius-sm)] border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--color-text)]">{item.label}</span>
                  <span className="text-sm font-bold" style={{ color: severityColor[item.severity] }}>{item.count}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{item.recommendation}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Agent 质量">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Agent runs" value={agentQuality.totalRuns} compact />
            <Metric label="成功率" value={agentQuality.toolSuccessRate === null ? "-" : `${agentQuality.toolSuccessRate}%`} compact />
            <Metric label="读回失败" value={agentQuality.readBackFailures} compact />
            <Metric label="路由异常" value={agentQuality.routingIssues} compact />
          </div>
          <div className="mt-4">
            <ListEmpty show={agentQuality.topFailureTypes.length === 0} text="暂无工具失败分类数据">
              {agentQuality.topFailureTypes.map((item) => (
                <Row key={item.type} left={item.type} right={`${item.count} 次`} />
              ))}
            </ListEmpty>
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="团队资产">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="参考简历" value={sharedAssets.referenceResumes} compact />
            <Metric label="共享资产" value={sharedAssets.sharedReferenceResumes} compact />
          </div>
          <div className="mt-4 space-y-2">
            {sharedAssets.assetGaps.length === 0 ? (
              <EmptyState text="暂未发现明显资产缺口。" />
            ) : sharedAssets.assetGaps.map((item) => (
              <Row key={item.direction} left={item.direction} right={item.missing} />
            ))}
          </div>
        </Panel>

        <Panel title="行动建议">
          <div className="space-y-3">
            {actionRecommendations.map((item) => (
              <div key={item.title} className="rounded-[var(--radius-sm)] bg-[var(--color-primary-muted)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--color-text)]">{item.title}</span>
                  <span className="text-[11px] text-[var(--color-primary)]">{priorityLabel(item.priority)}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-soft)]">{item.detail}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function CenteredText({ children }: { children: React.ReactNode }) {
  return <div className="py-16 text-center text-sm text-[var(--color-muted)]">{children}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="mb-4 text-sm font-semibold text-[var(--color-text)]">{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: React.ReactNode; compact?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`${compact ? "text-xl" : "text-3xl"} mt-1 font-bold text-[var(--color-text)]`}>{value}</div>
    </div>
  );
}

function Row({ left, right, children }: { left: string; right: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-divider)] py-2 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-sm text-[var(--color-text)]">{left}</div>
        {children}
      </div>
      <div className="shrink-0 text-xs text-[var(--color-muted)]">{right}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-[var(--color-muted)]">{text}</p>;
}

function ListEmpty({ show, text, children }: { show: boolean; text: string; children: React.ReactNode }) {
  return show ? <EmptyState text={text} /> : <div className="space-y-1">{children}</div>;
}

function priorityLabel(priority: "low" | "medium" | "high") {
  if (priority === "high") return "高优先级";
  if (priority === "medium") return "中优先级";
  return "观察";
}
