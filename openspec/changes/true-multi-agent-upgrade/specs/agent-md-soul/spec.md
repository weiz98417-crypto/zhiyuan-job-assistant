## ADDED Requirements

### Requirement: Agent 定义拆分为两层文件

每个 agent SHALL 由两个文件定义：
- `agent.md`：Markdown + YAML frontmatter，包含角色定位、对话风格、工具使用策略、领域知识、边界规则
- `index.ts`：TypeScript 注册表，包含 id、priority、model、toolNames、intentPatterns（仅 fallback）

agent.md 的 body 内容将作为该 agent 的 system prompt 基础，YAML frontmatter 的元数据注入 AgentDefinition。

#### Scenario: agent.md 加载成功
- **WHEN** 系统启动并注册 agent
- **THEN** `loadAgentMD(agentId)` 解析 frontmatter 和 body，返回 `{meta: {name, model, model_pro}, body: string}`

#### Scenario: agent.md 缺失时的 fallback
- **WHEN** agent 目录下不存在 agent.md 文件
- **THEN** 系统使用 index.ts 中 hard-coded 的 fallback prompt，并输出 warning 日志

#### Scenario: agent.md frontmatter 格式错误
- **WHEN** agent.md 的 YAML frontmatter 无法解析
- **THEN** 系统使用 index.ts fallback，并输出 error 日志指出解析错误位置

### Requirement: agent.md YAML frontmatter schema

每个 agent.md 的 frontmatter SHALL 至少包含以下字段：
- `name`（string）：agent 显示名称
- `model`（string）：默认使用的模型 ID

可选字段：
- `model_pro`（string）：用户触发"深度"模式时的升级模型 ID
- `knowledge`（string[]）：该 agent 需要的知识子集标识符列表

#### Scenario: 必需字段校验
- **WHEN** agent.md 的 frontmatter 缺少 `name` 或 `model` 字段
- **THEN** 系统拒绝加载该 agent 并使用 fallback，输出明确的缺失字段信息

### Requirement: agent.md 工具策略描述

agent.md 的 body 部分 SHALL 包含"工具使用策略"章节，描述：
- 每个可用工具的名称、适用场景、调用时机
- 不应使用的工具及原因
- 多条工具链式调用的策略

#### Scenario: Agent 遵循工具策略
- **WHEN** evaluate agent 收到 JD 文本
- **THEN** 它直接调用 evaluate_jd_full 评估，而不是先问"需要我评估吗"
