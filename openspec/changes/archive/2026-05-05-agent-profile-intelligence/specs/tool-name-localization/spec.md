## ADDED Requirements

### Requirement: 工具名中英文映射

系统 SHALL 维护一个集中式工具名到中文展示名的映射表，所有 Agent 聊天界面中的工具名展示 SHALL 使用中文名。

#### Scenario: 映射表定义

- **WHEN** 系统启动
- **THEN** 工具名映射表 SHALL 包含所有已注册工具的中文标签和 emoji 图标
- **AND** 未映射的工具 SHALL 使用原始英文名作为兜底
- **AND** 映射表 SHALL 位于 `lib/agent/tool-display-names.ts`

#### Scenario: 工具结果卡片展示中文名

- **WHEN** Agent Chat 展示工具执行结果卡片（ToolResultCard）
- **THEN** 卡片头部 SHALL 显示 "{emoji} {中文标签}" 替代英文 toolName
- **AND** "成功"/"失败"状态文案 SHALL 替换为"完成"/"失败"

#### Scenario: 工具执行中展示中文名

- **WHEN** Agent 正在执行工具（ExecutingIndicator）
- **THEN** "正在执行" 后 SHALL 显示中文工具名而非英文
- **AND** emoji SHALL 显示在工具名之前

### Requirement: 映射表覆盖所有工具

映射表 SHALL 覆盖当前注册的全部 15 个工具及 MCP 扩展工具。

#### Scenario: 查询工具映射

- **WHEN** Agent 调用查询类工具（search_applications / get_report_detail / get_profile / get_recent_activity / get_recommendations / get_pipeline_status）
- **THEN** 每个工具 SHALL 有对应的中文名和 emoji

#### Scenario: 行动工具映射

- **WHEN** Agent 调用行动类工具（evaluate_jd / evaluate_offer / generate_cv / scan_portals / check_health / fetch_jd_content / export_file / mine_profile）
- **THEN** 每个工具 SHALL 有对应的中文名和 emoji

#### Scenario: MCP 工具映射

- **WHEN** Agent 调用 MCP 扩展工具（web_search / get_weather / search_place / get_directions / search_jobs）
- **THEN** 每个工具 SHALL 有对应的中文名和 emoji
