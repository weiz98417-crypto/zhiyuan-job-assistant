## ADDED Requirements

### Requirement: 统一聊天界面

前端 SHALL 提供统一聊天界面，不区分探索/执行模式。

#### Scenario: 单一输入框

- **WHEN** 用户访问 /agent 页面
- **THEN** 显示一个聊天输入框，无 Tab 切换
- **AND** URL 不含 `?tab=` 参数

#### Scenario: Agent 自主判断

- **WHEN** 用户发送消息
- **THEN** Agent 根据内容判断聊天还是调工具
- **AND** 前端不强制指定 mode

#### Scenario: 后向兼容

- **WHEN** 服务端收到旧客户端带 mode 的请求
- **THEN** 正常处理（旧逻辑降级运行）

### Requirement: 统一 System Prompt

Agent System Prompt SHALL 合并聊天引导和工具调用两种能力。

#### Scenario: 聊天能力保留

- **WHEN** 用户说"我不确定要找什么样的工作"
- **THEN** Agent 以聊天方式引导，不调用工具

#### Scenario: 执行能力保留

- **WHEN** 用户说"查一下我的投递记录"
- **THEN** Agent 调用 search_applications 工具

#### Scenario: 自主判断

- **WHEN** 用户意图模糊（如"帮我看看"）
- **THEN** Agent 追问一句再决定，不猜测
