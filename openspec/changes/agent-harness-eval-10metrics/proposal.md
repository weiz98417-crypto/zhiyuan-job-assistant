## Why

Agent 有 10 项核心指标全面不达标，根因是 Harness/LLM 职责混淆——Harness 做的事交给 prompt，prompt 做的事用规则硬约束。需要系统性分离职责 + 建 eval framework 数据驱动迭代。

## What Changes

- 新建 eval framework（20 case，10 指标，mock/live 双模式）
- capToolCtx 从建议变硬截断
- ToolRegistry 加 matchHints 关键词偏置
- Prompt 砍 60% 规则（移到代码）
- Telemetry 事件注入 agent loop
- 工具白名单拦截幻觉

## Capabilities

### New Capabilities

- `agent-eval-framework`: eval framework with 20 test cases, 10 metrics, mock+live modes
- `tool-match-hints`: keyword hints for tool selection bias

### Modified Capabilities

- `agent-loop-client`: capToolCtx hard truncation + telemetry + context budget
- `agent-loop-engine`: same
- `agent-tools`: matchHints field + hallucination whitelist

## Impact

- `scripts/eval-agent.mjs` (NEW)
- `client-runner.ts` / `server-runner.ts`
- `tools/types.ts` / `tools/registry.ts`
- `prompt.ts` / `resume-agent.ts`
- `resume/agent.md`
