## ADDED Requirements

### Requirement: Agent SHALL be able to perform complete JD evaluation in one call

`evaluate_jd_full` 工具 SHALL 接收 JD 文本或 URL，按顺序执行：内容获取（如需）→ 风险扫描 → A-G 7 维评分 → 输出校验 → 写入追踪数据库，返回结构化评估报告。

#### Scenario: 从文本评估 JD

- **WHEN** Agent 调用 `evaluate_jd_full({ jd_text: "某公司招聘产品经理..." })`
- **THEN** 工具 SHALL 先调用 `/api/agent/scan-risks` 获取风险信号列表
- **AND** 再调用 `/api/evaluate` 获取 A-G 7 维评分
- **AND** 调用 `/api/data/validation` 校验输出
- **AND** 调用 `/api/data/application` 写入 SQLite
- **AND** 返回 `{ company, role, overallScore, archetype, blocks, risks }`

#### Scenario: 从 URL 评估 JD

- **WHEN** Agent 调用 `evaluate_jd_full({ jd_url: "https://..." })`
- **THEN** 工具 SHALL 先调用 `/api/agent/fetch-jd` 抓取 JD 文本
- **AND** 后续流程与文本评估相同

#### Scenario: JD 文本不足

- **WHEN** `jd_text` 少于 50 字符且无 `jd_url`
- **THEN** 工具 SHALL 返回 `{ success: false, error: "JD 文本不足 50 字符" }`

#### Scenario: 评估 API 失败

- **WHEN** `/api/evaluate` 返回非 200
- **THEN** 工具 SHALL 返回 `{ success: false, error: "评估失败: {status}" }`
- **AND** 不执行后续的校验和写入步骤

### Requirement: Fetch JD API endpoint SHALL extract text from URLs

`/api/agent/fetch-jd` SHALL 接收 URL，抓取页面内容并提取纯文本 JD 描述。

#### Scenario: 成功抓取

- **WHEN** POST `{ url: "https://www.zhipin.com/job_detail/..." }`
- **THEN** 返回 `{ success: true, data: { text: "提取的 JD 文本" } }`

#### Scenario: 抓取失败

- **WHEN** URL 返回非 200 或超时
- **THEN** 返回 `{ success: false, error: "无法获取 JD 内容" }`
