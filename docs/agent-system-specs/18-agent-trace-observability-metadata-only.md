# Spec 18: Agent Trace Observability With Metadata-Only Production

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0040、ADR-0007、ADR-0012、Spec 05 的 schema ownership；批次归属 0.13.1（B2）

## Problem Statement

model-gateway 不记录任何 token 用量与延迟（`src/lib/ai/model-gateway.ts` 全文无 usage 采集）；Run Evidence 在 admin 只是 runs+events 扁平 JSON 表格；模型调用成本不可见；gateway 日志字段为私有命名，换观测后端需重写。同时 prompt/补全含简历等个人数据，而记忆擦除治理（ADR-0033）不覆盖 trace 存储——正文入库将造成治理盲区。

## Solution

网关与 Run Evidence 事件按 OTel GenAI 命名整理为 Langfuse 形状的 trace→observations 树，落自家 Postgres additive 表并在 admin 呈现；生产只存元数据（模型、token、延迟、工具名、错误摘要），prompt/completion 正文仅开发环境存在；预留 OTel 形状导出点，未来接 Langfuse 只换 exporter。

## User Stories

1. 作为运维人员，我希望看到每个 Run 的模型调用树、token 成本与延迟，从而定位慢与贵的调用。
2. 作为评测人员，我希望 eval 分数能回写到对应 trace，从而把质量与成本对齐分析。
3. 作为求职者，我希望我的简历正文不出现在治理体系之外的新存储里，从而"忘掉我"的承诺不被 trace 架空。
4. 作为实现 Agent，我希望观测数据形状与开源后端兼容，从而未来接入只换 exporter 不换采集代码。

## Implementation Decisions

- 新表 additive，DDL 先过 openspec 评审：trace（=Agent Run）、observation（span=Tool Attempt，generation=模型调用，含 model、tokens、latency、finish_reason、error_summary）。
- model-gateway 每次 complete / streamChat 记录 generation 级用量：complete 扩展批 A（Spec 15）引入的可选 usage 字段；stream 请求带 `stream_options.include_usage` 并由网关解析末帧后透传（`buildBody` 现不支持，需扩展）；字段命名对齐 OTel GenAI 语义约定（`gen_ai.*`）。
- 生产模式只写元数据字段；prompt/completion 正文仅当开发环境开关启用时写入（ADR-0040，该约束必须有测试固定）。
- Run Evidence → trace 映射在既有 RunEvidenceObserver 管线内完成，不新增第二事件源。
- 导出点按 OTel 形状预留（接口先行、实现留空）；接入 Langfuse 时仅新增 exporter 适配器。
- 保留期：trace 元数据 180 天（对齐 ADR-0012 的 Evidence 档）、开发环境正文 30 天（对齐 Payload 档）；到期清理挂既有 maintenance 定时器。trace 是第三类存储，不自动继承 ADR-0012，本条即其保留决策。
- admin trace 页复用既有 admin 鉴权，只读呈现。

## Testing Decisions

- 投影单测：一次真实 Run 的 fixture → 完整 trace 树断言（含 span/generation 两类 observation）。
- 脱敏断言：生产模式下 trace 表不含正文内容——schema 层断言（无正文列或列有约束）+ 运行时断言双保险。
- e2e：跑一条真实旅程后 admin 页可见树、成本与延迟。
- 用量记录单测：complete 与 stream 两条路径均记录。

## Out of Scope

- Langfuse 自托管或 Langfuse Cloud；告警与预算熔断。
- trace 保留期已在本 spec 实现决策中定义（元数据 180 天 / dev 正文 30 天）；如需收紧另立 spec。

## Further Notes

- 若 eval 分数回写（Spec 15 产物）在 trace 树上呈现，只读引用既有 Eval Run 数据，不复制分数。
