## ADDED Requirements

### Requirement: Agent SHALL be able to decode recruitment black market terms

`decode_black_market_terms` 工具 SHALL 接收一个短语，查询服务端的 `modes/zh/risk-intel.md`（YAML 格式）中的黑话词典，返回匹配的词条及其真实含义和严重度。

#### Scenario: 单条匹配

- **WHEN** Agent 调用 `decode_black_market_terms({ phrase: "亲自带" })`
- **THEN** 返回 `{ success: true, data: [{ term: "亲自带", meaning: "长期无偿加班，随叫随到", severity: "high" }] }`

#### Scenario: 多条匹配

- **WHEN** phrase 包含多个黑话（如 "弹性工作制，薪资上不封顶"）
- **THEN** 返回所有匹配词条

#### Scenario: 无匹配

- **WHEN** phrase 不匹配任何黑话词条
- **THEN** 返回 `{ success: true, data: [] }`
- **AND** 格式化为 "未匹配到已知招聘黑话"

#### Scenario: 空输入

- **WHEN** `phrase` 为空字符串
- **THEN** 返回 `{ success: false, error: "请提供要解码的短语" }`

### Requirement: Decode-terms API SHALL load risk-intel.md YAML server-side

`/api/agent/decode-terms` SHALL 在服务端读 `modes/zh/risk-intel.md`，解析 YAML 的 `terms` 字段，用 `String.includes()` 做子串匹配。

#### Scenario: 正常匹配

- **WHEN** POST `{ phrase: "弹性工作制" }`
- **THEN** 加载 `risk-intel.md` → 解析 YAML → 遍历 `terms[]` → 匹配 `phrase` 包含 `term`
- **AND** 返回 `{ success: true, data: [{ term, meaning, severity }] }`

#### Scenario: YAML 加载失败

- **WHEN** `risk-intel.md` 不存在或 YAML 格式错误
- **THEN** 返回 `{ success: false, error: "黑话词典加载失败" }`
