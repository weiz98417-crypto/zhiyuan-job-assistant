## ADDED Requirements

### Requirement: Agent SHALL load dingwei positioning framework

`self_positioning` 工具 SHALL 加载 `modes/zh/dingwei.md` 的 4 阶段对话引导框架，返回给 LLM 用于驱动职业方向探索对话。

#### Scenario: 加载成功

- **WHEN** Agent 调用 `self_positioning()`
- **THEN** 工具调用 `/api/agent/mode/dingwei` 获取 Markdown 内容
- **AND** 返回 `{ success: true, data: { framework: "4阶段引导文本", phases: [...] } }`

#### Scenario: mode 文件不可用

- **WHEN** `modes/zh/dingwei.md` 不存在
- **THEN** 返回 `{ success: false, error: "定位引导系统暂不可用" }`

### Requirement: Mode file API SHALL serve markdown content

`/api/agent/mode/[mode]` SHALL 接收 mode 名称，返回对应 `modes/zh/{mode}.md` 文件的 Markdown 内容。

#### Scenario: 有效 mode

- **WHEN** GET `/api/agent/mode/dingwei`
- **THEN** 服务端读 `modes/zh/dingwei.md`
- **AND** 返回 `{ success: true, data: { content: "..." } }`

#### Scenario: 无效 mode

- **WHEN** GET `/api/agent/mode/nonexistent`
- **THEN** 返回 `{ success: false, error: "模式文件不存在" }`，状态码 404
