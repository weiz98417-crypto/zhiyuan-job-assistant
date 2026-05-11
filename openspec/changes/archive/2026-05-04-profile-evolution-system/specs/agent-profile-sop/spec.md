## MODIFIED Requirements

### Requirement: 自我定位 Skill 文件

系统 SHALL 提供 `frontend/skills/zhiyuan-dingwei.md` 作为自我定位 Skill 文件。Agent Chat 在探索 Tab 触发定位时 SHALL 加载该文件作为系统提示词。

#### Scenario: Skill 触发

- **WHEN** 用户点击「自我定位」SuggestionChip 或说"帮我做自我定位""帮我定位""我不知道自己适合什么"
- **THEN** Agent SHALL 加载 `frontend/skills/zhiyuan-dingwei.md` 的内容
- **AND** Agent SHALL 按文件定义的角色、流程（初次定位/迭代更新）、问题工具箱、退出条件进行对话
- **AND** SHALL 通过 `mine_profile` 工具记录对话进度和信号

#### Scenario: Skill 可独立迭代

- **WHEN** 需要调整定位对话策略或增加问题
- **THEN** 只需修改 `frontend/skills/zhiyuan-dingwei.md`，不需要改 TypeScript 代码
- **AND** 修改后下次对话即生效

### Requirement: 结构化渐进式对话

Skill SHALL 使用结构化渐进式对话模式，先收敛（状态摸底选择题）再发散（按路径深挖），再收敛（定位卡输出）。区别于旧版的纯开放式教练对话。

#### Scenario: 先收敛再发散

- **WHEN** 用户进入自我定位
- **THEN** Agent SHALL 先给出 4 选 1 的状态选择题
- **AND** 用户选择后，Agent SHALL 确认路径并开始针对性深挖
- **AND** 用户始终知道自己在哪个阶段

#### Scenario: 深挖阶段每轮只问一个问题

- **WHEN** 在深挖阶段
- **THEN** Agent SHALL 每轮只问一个问题
- **AND** 用户回答后根据回答质量决定追问还是推进

#### Scenario: 用户不耐烦时主动推进

- **WHEN** 用户表达"然后呢""所以呢""给我点建议"
- **THEN** Agent SHALL 立即总结当前收获并推进到下一阶段

### Requirement: mine_profile 工具调用（替代原自适应对话引导要求）

Agent SHALL 在 dingwei 对话中通过 `mine_profile` 工具管理对话阶段和信号存储。每轮对话应调用 tool 推进 SOP 或记录信号。

#### Scenario: 每轮回答后记录信号

- **WHEN** 用户在 dingwei 对话中提供了有信息量的回答
- **THEN** Agent SHALL 调用 `mine_profile(action="answer", answer="用户回答摘要")`
- **AND** 对话界面 SHALL 显示"（已记录）"标记

#### Scenario: SOP 阶段推进

- **WHEN** 用户完成了当前阶段的回答且 Agent 确认
- **THEN** mine_profile SOP SHALL 推进到下一阶段
- **AND** Agent SHALL 收到新的阶段提示词

#### Scenario: 定位完成

- **WHEN** Agent 输出了定位卡且用户确认
- **THEN** Agent SHALL 调用 `mine_profile(action="complete")` 触发画像写入
