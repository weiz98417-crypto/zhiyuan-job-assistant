## ADDED Requirements

### Requirement: 多轮流式教练对话

系统 SHALL 支持面试教练的多轮对话模式，用户可发送消息、接收流式结构化回复，并继续追问。

#### Scenario: 开始新对话

- **WHEN** 用户选择面试模式并输入经历描述后点击"生成"
- **THEN** 系统将模式说明作为 system message、经历作为 user message 组装为消息历史
- **AND** 调用 `/api/interview/coach/stream` SSE 端点
- **AND** 结构化回答逐段流式出现在对话区域

#### Scenario: 流式分段输出

- **WHEN** API 返回 `section` 事件
- **THEN** 前端在对话区域渲染对应章节（如"背景""角色""行动""结果""反思"）
- **AND** 每个章节带有章节标签和内容
- **AND** 内容以打字机效果逐字呈现（保持与 evaluate 流式一致的观感）

#### Scenario: 追问列表可点击

- **WHEN** 流式完成后 API 返回 `followUps` 事件
- **THEN** 系统在最后一条助手消息下方渲染可点击的追问按钮
- **AND** 每个按钮显示追问文本和简短提示
- **WHEN** 用户点击某个追问按钮
- **THEN** 该追问文本作为 user message 添加到对话历史
- **AND** 系统自动调用流式 API 继续对话

#### Scenario: 手动输入追问

- **WHEN** 用户在输入框中输入内容并发送
- **THEN** 该内容作为 user message 添加到对话历史
- **AND** 系统调用流式 API 继续对话

#### Scenario: 对话历史保留

- **WHEN** 用户在同一会话内进行多轮对话
- **THEN** 全部消息历史保留在 `coachMessages` 状态中
- **AND** 消息历史传递给 API 以维持上下文连贯性
- **AND** 超出 20 条时自动裁剪最早的 user+assistant 消息对

#### Scenario: 切换模式清空历史

- **WHEN** 用户在对话进行中切换到不同面试模式
- **THEN** 系统清空对话历史并显示提示
- **AND** 输入区域保持在新模式的初始状态

### Requirement: 出题 Tab 正确传递 JD 和简历数据

系统 SHALL 从正确的数据源加载 JD 和简历内容，并传递给出题 API。

#### Scenario: JD 选择器从 JD 库加载

- **WHEN** 用户打开出题 Tab 的 JD 选择器
- **THEN** 下拉列表显示 `db.jds` 中的所有 JD 记录（公司+职位+日期）
- **AND** 默认选项为"通用出题（不限 JD）"

#### Scenario: 选中 JD 后传递正文

- **WHEN** 用户选中某个 JD 并点击"生成面试题目"
- **THEN** 系统读取该 JD 的 `body` 字段作为 `jdText` 传递给 API
- **AND** 同时读取选中 JD 的 `company` 和 `role` 字段

#### Scenario: CV 自动加载

- **WHEN** 出题 API 被调用时
- **THEN** 系统调用 `getCVFullText()` 读取简历全文作为 `cvText` 传递给 API
- **AND** 如果简历为空，传递空字符串，API 进入通用出题模式

#### Scenario: CV 状态指示

- **WHEN** 用户查看出题 Tab
- **THEN** 显示简历加载状态：已加载（绿色标签"简历已就绪"）/ 为空（灰色标签"未找到简历，将通用出题"）
