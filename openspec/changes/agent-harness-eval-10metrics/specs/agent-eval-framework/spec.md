## ADDED Requirements

### Requirement: Eval Framework

系统 SHALL 提供 `scripts/eval-agent.mjs` 独立 eval 脚本，支持 mock 和 live 双模式，覆盖 20 条固定测试 case，计算 10 项 agent 核心指标。

#### Scenario: Mock 模式测试 harness

- **WHEN** 运行 `node scripts/eval-agent.mjs --mock`
- **THEN** 不调用真实 LLM API
- **AND** 注入预设的 mock LLM 返回（工具调用 + 文本）
- **AND** 只测试 harness 的循环控制/工具执行/错误处理/上下文管理
- **AND** 20 条 case 全部通过

#### Scenario: Live 模式测试全链路

- **WHEN** 运行 `node scripts/eval-agent.mjs --live`
- **THEN** 调用真实 `/api/agent/run` 或 agent loop
- **AND** 收集 telemetry 事件计算 10 项指标
- **AND** 输出逐项报告（当前值 vs 目标值）
