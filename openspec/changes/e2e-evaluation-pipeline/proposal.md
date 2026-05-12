## Why

当前 JD 评估需要多步：粘贴文本 → 等待 → 看风险 → 等待 → 看评分。不是一次交互出完整报告。Claude Code 的体验是一次粘贴直接出报告。

## What Changes

- 新建 `/api/agent/evaluate-pipeline`：一键编排端点（fetch → risks → evaluate → persist → report）
- 修改 `evaluate_jd_full` 工具：调新端点替代分别调 3 个 API

## Capabilities

- `evaluate-pipeline`: 一键 JD 评估管道——URL/文本输入 → 完整报告（风险 + A-G评分 + 入库确认）

## Impact

- **新建**: `frontend/src/app/api/agent/evaluate-pipeline/route.ts`
- **修改**: `frontend/src/lib/agent/tools/action/evaluate-jd-full.ts`
