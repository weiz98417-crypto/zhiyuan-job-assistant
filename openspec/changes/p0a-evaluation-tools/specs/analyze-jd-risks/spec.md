## ADDED Requirements

### Requirement: Agent SHALL be able to scan JD text for risk signals

`analyze_jd_risks` 工具 SHALL 接收 JD 文本片段，调用服务端的 `scan-risks.mjs` 执行正则匹配，返回风险信号列表和加权评分。

#### Scenario: 检测到风险信号

- **WHEN** JD 文本包含 "亲自带" 和 "弹性工作制"
- **THEN** 返回信号列表包含 `{ signal: ""亲自带"=长期无偿加班", excerpt: "leader亲自带，快速成长", severity: "high" }`
- **AND** 包含 `{ signal: ""弹性工作制"=可能无固定下班时间", excerpt: "弹性工作制，结果导向", severity: "medium" }`
- **AND** 格式化为风险表格，包含加权总分和综合风险等级

#### Scenario: 无风险信号

- **WHEN** JD 文本不匹配任何 trigger
- **THEN** 返回 `🟢 未检测到明显风险信号`

#### Scenario: 风险扫描 API 不可用

- **WHEN** `/api/agent/scan-risks` 返回错误
- **THEN** 工具 SHALL 返回 `{ success: false, error: "风险扫描失败: {status}" }`

### Requirement: Scan-risks API SHALL execute server-side regex matching

`/api/agent/scan-risks` SHALL 接收 JD 文本，在服务端 spawn `node scripts/scan-risks.mjs --jd-text "..."` 并返回 JSON 信号列表。

#### Scenario: 正常执行

- **WHEN** POST `{ jd_text: "..." }` 到 `/api/agent/scan-risks`
- **THEN** 服务端 spawn `node scripts/scan-risks.mjs --jd-text "..."` 进程
- **AND** 收集 stdout 并 JSON.parse
- **AND** 返回 `{ success: true, data: [{ signal, excerpt, severity }] }`

#### Scenario: trigger 文件缺失

- **WHEN** `risk-intel-triggers.yml` 不存在
- **THEN** scan-risks.mjs 返回空数组 `[]`
- **AND** API 返回 `{ success: true, data: [] }`
