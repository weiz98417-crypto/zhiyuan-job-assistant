## ADDED Requirements

### Requirement: 自我定位 Skill 文件

系统 SHALL 提供 `modes/zh/dingwei.md` 作为自我定位 Skill 文件，与 `jianzhi.md` 同级。Agent Chat 触发时加载该文件作为系统提示词。

#### Scenario: Skill 触发

- **WHEN** 用户点击「自我定位」SuggestionChip 或说"帮我做自我定位""帮我定位""我不知道自己适合什么"
- **THEN** Agent SHALL 加载 `modes/zh/dingwei.md` 的内容
- **AND** Agent SHALL 按文件定义的角色（引导者）、原则、工具箱、退出条件进行对话

#### Scenario: Skill 可独立迭代

- **WHEN** 需要调整对话策略或增加问题
- **THEN** 只需修改 `modes/zh/dingwei.md`，不需要改 prompt.ts 或其他代码

### Requirement: 自适应对话引导

Skill SHALL 使用自适应对话模式，而非固定顺序问卷。Agent 根据用户反应从工具箱中选择合适的问题。

#### Scenario: 跟能量深挖

- **WHEN** 用户回答某个问题时语气积极、内容具体、提到成就感
- **THEN** Agent SHALL 追问该方向而非跳到下一个问题

#### Scenario: 模糊回答追问

- **WHEN** 用户回答模糊（"还行""差不多""我也不知道"）
- **THEN** Agent SHALL 追问具体例子

#### Scenario: 限幅信念检测

- **WHEN** 用户表达"我不行""太晚了""没什么特别的"
- **THEN** Agent SHALL 先重构信念再继续对话，而非跳过

#### Scenario: 用户自己总结收尾

- **WHEN** 对话进入收尾阶段
- **THEN** Agent SHALL 问"现在什么变得更清晰了？"
- **AND** Agent SHALL 不替用户总结
