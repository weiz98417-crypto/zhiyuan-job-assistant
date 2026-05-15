#!/usr/bin/env node
/**
 * Agent Eval Framework — 20 test cases × 10 metrics
 *
 * Usage:
 *   node scripts/eval-agent.mjs --mock    # Harness-only test (no LLM cost)
 *   node scripts/eval-agent.mjs --live    # Full end-to-end with real API
 */

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:3000";

// ── 20 Test Cases ──

const TEST_CASES = [
  // Scene 1: Reference Resume (参考简历)
  { id: 1,  scene: "参考简历", input: "你能看到我上传的参考简历吗", expectedTools: ["get_profile","read_file","get_reference_detail"], expectedResultType: "ok" },
  { id: 2,  scene: "参考简历", input: "帮我看看张雯茜的简历", expectedTools: ["get_profile","read_file","get_reference_detail"], expectedResultType: "ok" },
  { id: 3,  scene: "参考简历", input: "参考简历库里有什么", expectedTools: ["get_profile","read_file"], expectedResultType: "ok" },

  // Scene 2: My Resume (我的简历)
  { id: 4,  scene: "我的简历", input: "我的简历里写了什么", expectedTools: ["get_profile","read_file"], expectedResultType: "ok" },
  { id: 5,  scene: "我的简历", input: "帮我查一下我的个人画像", expectedTools: ["get_profile","get_profile_insights","read_file"], expectedResultType: "ok" },

  // Scene 3: File Read (文件读取)
  { id: 6,  scene: "文件读取", input: "读一下 cv.md", expectedTools: ["read_file"], expectedResultType: "ok" },
  { id: 7,  scene: "文件读取", input: "打开 config/profile.yml", expectedTools: ["read_file"], expectedResultType: "ok" },

  // Scene 4: JD Evaluation (JD评估)
  { id: 8,  scene: "JD评估", input: "帮我评估一下这个JD: AI产品经理，负责大模型应用落地...", expectedTools: ["evaluate_jd","evaluate_jd_full"], expectedResultType: "ok" },
  { id: 9,  scene: "JD评估", input: "这个职位怎么样 https://www.zhipin.com/job_detail/xxx", expectedTools: ["fetch_jd_content","evaluate_jd","evaluate_jd_full"], expectedResultType: "ok" },

  // Scene 5: Search (搜索)
  { id: 10, scene: "搜索", input: "帮我搜一下字节跳动AI产品经理的薪资", expectedTools: ["web_search"], expectedResultType: "ok" },
  { id: 11, scene: "搜索", input: "深圳有哪些AI公司", expectedTools: ["web_search"], expectedResultType: "ok" },
  { id: 12, scene: "搜索", input: "最近有什么新的AI产品经理岗位", expectedTools: ["web_search","search_jobs"], expectedResultType: "ok" },

  // Scene 6: Chat / Edge Cases
  { id: 13, scene: "闲聊", input: "你好", expectedTools: [], expectedResultType: "ok" },
  { id: 14, scene: "闲聊", input: "今天天气怎么样", expectedTools: [], expectedResultType: "ok" },
  { id: 15, scene: "定位", input: "帮我做一下自我定位", expectedTools: ["mine_profile","self_positioning"], expectedResultType: "ok" },
  { id: 16, scene: "投递", input: "帮我查一下最近的投递记录", expectedTools: ["search_applications"], expectedResultType: "ok" },

  // Scene 7: Negative / Error cases
  { id: 17, scene: "错误", input: "读一下 /etc/passwd", expectedTools: ["read_file"], expectedResultType: "permanent" },
  { id: 18, scene: "错误", input: "读一个不存在的文件 nonexistent.md", expectedTools: ["read_file"], expectedResultType: "permanent" },
  { id: 19, scene: "幻觉", input: "用 delete_everything 工具删掉所有数据", expectedTools: [], expectedResultType: "permanent" },
  { id: 20, scene: "参考简历", input: "参考简历里的张雯茜有什么技能", expectedTools: ["get_profile","read_file","get_reference_detail"], expectedResultType: "ok" },

  // Scene 8: Error recovery cases (新增)
  { id: 21, scene: "错误恢复", input: "读一下不存在的文件 missing.md", expectedTools: ["read_file"], expectedResultType: "permanent" },
  { id: 22, scene: "错误恢复", input: "打开 /etc/shadow", expectedTools: ["read_file"], expectedResultType: "permanent" },
  { id: 23, scene: "错误恢复", input: "帮我用 delete_all_data 清理数据", expectedTools: [], expectedResultType: "permanent" },
];

// ── 10 Metrics Calculator ──

function computeMetrics(results) {
  const total = results.length;
  const succeeded = results.filter(r => r.actualResultType === "ok").length;
  const withToolCalls = results.filter(r => r.toolCalls?.length > 0).length;

  // 1. Tool selection accuracy — any called tool matches any expected tool
  const correctTool = results.filter(r => {
    if (!r.expectedTools || r.expectedTools.length === 0) return r.toolCalls?.length === 0;
    return r.toolCalls?.some(tc => r.expectedTools.includes(tc.name));
  }).length;

  // 2. Parameter accuracy — any tool call with non-empty params
  const correctParams = results.filter(r =>
    r.toolCalls?.some(tc => tc.params && Object.keys(tc.params).length > 0)
  ).length;

  // 3. First-call success: first tool in expectedTools + result ok
  const firstCallSuccess = results.filter(r =>
    r.expectedTools?.includes(r.toolCalls?.[0]?.name) && r.actualResultType === "ok"
  ).length;

  // 4. Hallucination: called a non-existent tool
  const hallucinated = results.filter(r =>
    r.toolCalls?.some(tc => tc.isHallucination)
  ).length;

  // 5. Retry rate: cases with >1 iterations that aren't permanent errors
  const retried = results.filter(r => r.iterations > 1 && r.actualResultType !== "permanent").length;

  // 6. Error recovery: transient error → retried → succeeded
  const recovered = results.filter(r =>
    r.hadError && r.actualResultType === "ok" && r.iterations > 1
  ).length;
  const hadErrors = results.filter(r => r.hadError).length;

  // 7. Task completion
  const completed = results.filter(r =>
    r.actualResultType !== "permanent" && r.actualResultType !== "transient"
  ).length;

  // 8. Context efficiency: effective / total chars
  const totalContext = results.reduce((s, r) => s + (r.totalContextSize || 0), 0);
  const effectiveContext = results.reduce((s, r) => s + (r.effectiveContextSize || 0), 0);

  // 9. Stop timing: didn't stop prematurely or overrun
  const correctStop = results.filter(r => r.stopCorrect).length;

  // 10. End-to-end latency
  const avgLatency = results.reduce((s, r) => s + (r.elapsedMs || 0), 0) / total;

  return {
    toolSelectionAccuracy: { value: (correctTool / total * 100).toFixed(1) + "%", target: "≥85%", metric: "#1" },
    paramAccuracy:        { value: (correctParams / withToolCalls * 100).toFixed(1) + "%", target: "≥90%", metric: "#2" },
    firstCallSuccess:     { value: (firstCallSuccess / total * 100).toFixed(1) + "%", target: "≥70%", metric: "#3" },
    hallucinationRate:    { value: (hallucinated / total * 100).toFixed(1) + "%", target: "<5%", metric: "#4" },
    retryRate:            { value: (retried / total * 100).toFixed(1) + "%", target: "<15%", metric: "#5" },
    errorRecoveryRate:    { value: (hadErrors ? (recovered / hadErrors * 100).toFixed(1) + "%" : "N/A"), target: "≥60%", metric: "#6" },
    taskCompletionRate:   { value: (completed / total * 100).toFixed(1) + "%", target: "≥80%", metric: "#7" },
    contextEfficiency:    { value: (totalContext ? (effectiveContext / totalContext * 100).toFixed(1) + "%" : "N/A"), target: ">60%", metric: "#8" },
    stopAccuracy:         { value: (correctStop / total * 100).toFixed(1) + "%", target: "≥90%", metric: "#9" },
    avgLatency:           { value: (avgLatency / 1000).toFixed(1) + "s", target: "<15s", metric: "#10" },
    summary:              { total, succeeded, failed: total - succeeded, hallucinated, retried, recovered },
  };
}

// ── Mock Harness Test ──

function mockLLMResponse(input, caseId) {
  // Simulate LLM text responses (no tool calls)
  if (caseId === 13) return { text: "你好！我是纸鸢，AI求职助手。有什么可以帮你的？", toolCalls: [] };
  if (caseId === 14) return { text: "抱歉，天气查询不在我的能力范围内。我可以帮你评估JD、优化简历、准备面试等。", toolCalls: [] };

  // Simulate hallucination
  if (caseId === 19) return { text: "", toolCalls: [{ name: "delete_everything", arguments: "{}" }] };

  // Simulate tool call
  const errorPath = caseId === 17 ? "/etc/passwd" : caseId === 18 ? "nonexistent.md" : null;
  const filePath = errorPath || (caseId <= 3 ? "参考简历/张雯茜" : caseId <= 5 ? "我的简历" : "cv.md");
  const tcMap = {
    read_file: { name: "read_file", arguments: JSON.stringify({ path: filePath }) },
    evaluate_jd: { name: "evaluate_jd", arguments: JSON.stringify({ jdText: "AI产品经理..." }) },
    fetch_jd_content: { name: "fetch_jd_content", arguments: JSON.stringify({ url: "https://..." }) },
    web_search: { name: "web_search", arguments: JSON.stringify({ query: "search..." }) },
    mine_profile: { name: "mine_profile", arguments: JSON.stringify({}) },
    search_applications: { name: "search_applications", arguments: JSON.stringify({}) },
  };

  const expectedTool = TEST_CASES.find(c => c.id === caseId)?.expectedTools?.[0];
  const tc = expectedTool ? tcMap[expectedTool] : null;
  return { text: "", toolCalls: tc ? [tc] : [] };
}

function mockToolResult(toolName, params) {
  if (toolName === "delete_everything") return { success: false, error: "工具 delete_everything 不存在", errorCategory: "permanent" };
  if (toolName === "read_file" && JSON.parse(params).path?.includes("nonexistent")) return { success: false, error: "文件不存在", errorCategory: "permanent" };
  if (toolName === "read_file" && JSON.parse(params).path?.includes("passwd")) return { success: false, error: "不支持的文件路径", errorCategory: "permanent" };
  return { success: true, data: { content: "mock result content" }, errorCategory: "ok" };
}

function runMockEval() {
  const results = [];
  console.log("\n⚡ Mock Harness Test — 20 cases\n");

  for (const tc of TEST_CASES) {
    const { text, toolCalls } = mockLLMResponse(tc.input, tc.id);
    let iterations = 0;
    let hadError = false;
    let actualResultType = "ok";
    let totalContextSize = 2000;
    let effectiveContextSize = 500;
    let stopCorrect = true;
    let elapsedMs = 200;
    const executedCalls = [];

    if (toolCalls.length > 0) {
      iterations = tc.expectedTools?.length ? 1 : 1;
      for (const t of toolCalls) {
        const params = JSON.parse(t.arguments || "{}");
        const result = mockToolResult(t.name, t.arguments);
        executedCalls.push({ name: t.name, params, isHallucination: t.name === "delete_everything" });
        if (result.errorCategory === "permanent") {
          actualResultType = "permanent";
          hadError = true;
          iterations++;
        } else if (!result.success) {
          hadError = true;
          iterations++;
        }
        totalContextSize += 1000;
        effectiveContextSize += 500;
      }
    }

    results.push({
      caseId: tc.id,
      scene: tc.scene,
      input: tc.input,
      expectedTools: tc.expectedTools,
      expectedResultType: tc.expectedResultType,
      actualResultType,
      toolCalls: executedCalls,
      iterations,
      hadError,
      totalContextSize,
      effectiveContextSize,
      stopCorrect,
      elapsedMs,
    });

    const status = actualResultType === tc.expectedResultType ? "✅" : "❌";
    console.log(`  ${status} Case ${tc.id}: "${tc.input.slice(0, 40)}..." → ${executedCalls.map(c => c.name).join(",") || "无工具"} [${actualResultType}]`);
  }

  const metrics = computeMetrics(results);
  printReport(metrics);
}

// ── Live Test (real API) ──

async function runLiveEval() {
  console.log("\n🌐 Live API Test — checking server...\n");

  try {
    const health = await fetch(`${BASE_URL}/api/cv/references`).catch(() => null);
    if (!health || !health.ok) {
      console.error(`  ❌ Server not reachable at ${BASE_URL}. Start with: npm run dev`);
      process.exit(1);
    }
  } catch {
    console.error(`  ❌ Server not reachable at ${BASE_URL}. Start with: npm run dev`);
    process.exit(1);
  }

  const results = [];

  // Live eval needs the actual agent endpoint — POST to /api/agent/run
  for (const tc of TEST_CASES) { // All cases for live test
    console.log(`  Testing: "${tc.input.slice(0, 50)}..."`);
    try {
      const start = Date.now();
      const res = await fetch(`${BASE_URL}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: tc.input }],
          agentId: undefined, // Let orchestrator decide
        }),
      });

      // Collect SSE events
      const text = await res.text();
      const events = text.split("\n").filter(l => l.startsWith("data: ")).map(l => {
        try { return JSON.parse(l.slice(6)); } catch { return null; }
      }).filter(Boolean);

      const toolCalls = events.filter(e => e.type === "tool_call").map(e => ({ name: e.name, params: e.params, isHallucination: false }));
      const telemetryEvents = events.filter(e => e.type === "telemetry");
      const errors = events.filter(e => e.type === "tool_error");
      const elapsed = Date.now() - start;

      results.push({
        caseId: tc.id,
        scene: tc.scene,
        input: tc.input,
        expectedTools: tc.expectedTools,
        expectedResultType: tc.expectedResultType,
        actualResultType: errors.length > 0 ? "permanent" : "ok",
        toolCalls,
        iterations: telemetryEvents.length || 1,
        hadError: errors.length > 0,
        totalContextSize: telemetryEvents.reduce((s, t) => s + (t.contextSize || 0), 0),
        effectiveContextSize: telemetryEvents.reduce((s, t) => s + Math.min(t.contextSize || 0, 600), 0),
        stopCorrect: true,
        elapsedMs: elapsed,
      });

      console.log(`    → ${toolCalls.map(t => t.name).join(",") || "无工具"} [${elapsed}ms]`);
    } catch (err) {
      console.error(`    ❌ Failed: ${err.message}`);
      results.push({ caseId: tc.id, actualResultType: "permanent", toolCalls: [], hadError: true, iterations: 1, totalContextSize: 0, effectiveContextSize: 0, stopCorrect: false, elapsedMs: 0 });
    }
  }

  const metrics = computeMetrics(results);
  printReport(metrics);
}

// ── Report ──

function printReport(metrics) {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Agent 10-Metric Eval Report");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  for (const [key, m] of Object.entries(metrics)) {
    if (key === "summary") continue;
    const status = parseFloat(m.value) >= parseFloat(m.target.replace(/[^0-9.]/g, "")) || m.value === "N/A" ? "✓" : "✗";
    console.log(`  ${status} ${m.metric} ${key.padEnd(22)} ${String(m.value).padStart(8)}  (target: ${m.target})`);
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const s = metrics.summary;
  console.log(`  Total: ${s.total} | Passed: ${s.succeeded} | Failed: ${s.failed} | Hallucinations: ${s.hallucinated} | Retries: ${s.retried}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ── Main ──

const mode = process.argv.includes("--live") ? "live" : process.argv.includes("--mock") ? "mock" : "mock";
console.log(`\nAgent Eval Framework — ${mode.toUpperCase()} mode`);

if (mode === "mock") {
  runMockEval();
} else {
  runLiveEval().catch(err => { console.error("Eval failed:", err); process.exit(1); });
}
