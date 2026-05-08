## ADDED Requirements

### Requirement: 流式评估 SSE 端点

系统 SHALL 提供 `POST /api/evaluate/stream` 端点，接收 JD 文本后按 modes/zh/jianzhi.md 定义的 A-G 板块逐步执行评估，每板块独立调用 LLM，通过 SSE 向客户端推送进度事件。

#### Scenario: 接受 JD 文本并开始流式评估

- **WHEN** 客户端 POST `{ jdText: "...", language: "zh" }` 到 `/api/evaluate/stream`
- **THEN** 服务端立即返回 `Content-Type: text/event-stream`
- **AND** 首个事件为 `phase` 类型，phase 值为 `extracting_jd`

#### Scenario: SSE 事件类型完整

- **WHEN** 一次完整评估执行
- **THEN** 服务端 SHALL 按顺序推送以下事件类型：`phase`、`block_start`、`block_chunk`、`block_done`、`score`、`overall_score`、`search_start`、`search_result`、`report_saved`、`done`、`error`

#### Scenario: 评估完成后写文件

- **WHEN** 所有 A-G block 生成完成且总分计算完毕
- **THEN** 服务端 SHALL 将完整报告写入 `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`
- **AND** 服务端 SHALL 更新 `data/applications.md` 追加一行追踪记录
- **AND** 推送 `report_saved` 事件，包含文件路径和编号

#### Scenario: 单板块失败不阻断后续

- **WHEN** 某个 block 的 LLM 调用失败（超时/API 错误）
- **THEN** 该 block SHALL 推送 `error` 事件，内容标记为失败
- **AND** 后续 block 继续执行，不被阻断
- **AND** 最终 `overall_score` 将失败 block 的分数记为 0

### Requirement: Block D 搜索增强

Block D（薪资与市场）在调用 LLM 生成分析内容之前，服务端 SHALL 先执行 WebSearch 搜索真实薪资数据，将搜索结果作为上下文注入 LLM。

#### Scenario: 薪资搜索执行

- **WHEN** 评估进入 Block D
- **THEN** 服务端推送 `search_start` 事件，query 为公司名+岗位名+薪资
- **AND** 服务端执行 2-3 次 WebSearch 查询
- **AND** 每次搜索完成后推送 `search_result` 事件，包含结果数量和摘要

#### Scenario: 搜索结果注入 LLM

- **WHEN** WebSearch 返回结果后
- **THEN** 搜索结果摘要 SHALL 被追加到 Block D 的 system prompt 中
- **AND** LLM SHALL 基于搜索结果（而非模型记忆）进行分析
- **AND** 如果搜索无结果，LLM SHALL 在 Block D 输出中标注「无公开薪资数据」

#### Scenario: 无搜索结果

- **WHEN** WebSearch 无法找到相关薪资数据
- **THEN** Block D 输出中 SHALL 包含「*🟡 未能查询到该公司/岗位的公开薪资数据，以下分析基于行业平均水平估算*」
- **AND** LLM SHALL 使用 _shared.md 中定义的行业通用薪资区间进行估算

### Requirement: 分块 LLM 调用编排

服务端 SHALL 为每个 A-G block 构造独立的 system prompt 并独立调用 LLM。每个 block 的 system prompt 从 modes/zh/jianzhi.md 中提取该 block 对应的规则片段。

#### Scenario: Block B 注入 archetype 策略

- **WHEN** 执行 Block B（简历匹配）
- **THEN** system prompt SHALL 包含 jianzhi.md 中 Block B 的规则
- **AND** SHALL 包含当前职位检测到的 archetype 及其对应的证明点策略
- **AND** SHALL 包含从 cv.md 读取的候选人简历全文

#### Scenario: Block F 注入故事库

- **WHEN** 执行 Block F（面试准备）
- **THEN** system prompt SHALL 包含 jianzhi.md 中 Block F 的规则
- **AND** 如果 `interview-prep/story-bank.md` 存在，SHALL 将其内容注入 prompt
- **AND** LLM SHALL 优先复用故事库中已有的相关故事

### Requirement: 客户端取消支持

客户端 SHALL 能够通过关闭 SSE 连接来取消正在进行的评估。

#### Scenario: 用户中断评估

- **WHEN** 用户在评估过程中关闭页面或调用 abort
- **THEN** 服务端 SHALL 通过 `request.signal.aborted` 检测到断开
- **AND** SHALL 停止后续 LLM 调用
- **AND** 已完成并推送的 block 内容不丢失
