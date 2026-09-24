const fs = require("fs");
let s = fs.readFileSync("src/app/api/sessions/[id]/route.ts", "utf8");
const oldStr = `    const { id } = await params;
    const body = projectSessionMutationForPersistence(await request.json());`;
if (!s.includes(oldStr)) { console.error("miss"); process.exit(1); }
const newStr = `    const { id } = await params;
    const raw = await request.json();
    // 0.11.0-C (ADR-0030): the worker is the sole transcript writer. The
    // browser may update session metadata but never the messages array.
    if (raw && typeof raw === "object" && "messages" in raw) {
      return NextResponse.json(
        { success: false, error: "messages 由 Agent Worker 独占写入；客户端请通过 durable Run 提交内容。" },
        { status: 422 },
      );
    }
    const body = projectSessionMutationForPersistence(raw);`;
s = s.replace(oldStr, newStr);
fs.writeFileSync("src/app/api/sessions/[id]/route.ts", s);
console.log("PATCH guard added");
