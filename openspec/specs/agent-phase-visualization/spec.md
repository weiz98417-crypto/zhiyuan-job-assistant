## ADDED Requirements

### Requirement: SSE 事件协议

API 路由 `/api/agent/chat` SHALL 使用 Server-Sent Events 协议输出类型化事件，客户端解析后驱动 UI 状态机。

#### Scenario: 事件类型定义

- **WHEN** 服务端发送 SSE 事件
- **THEN** 事件格式为 `data: <json>\n\n`
- **AND** JSON 包含 `type` 字段，取值限于 `phase` | `tool_call` | `tool_result` | `text` | `done`

#### Scenario: phase 事件

- **WHEN** Agent 流程进入新阶段
- **THEN** 服务端发送 `{"type":"phase","phase":"thinking"|"executing"|"responding"}`
- **AND** 客户端据此切换 UI 视觉状态

#### Scenario: tool_call 事件

- **WHEN** LLM 决定调用工具
- **THEN** 服务端发送 `{"type":"tool_call","name":"<tool_name>","params":{...}}`
- **AND** 该事件紧接在 `phase: executing` 之后

#### Scenario: tool_result 事件

- **WHEN** 工具执行完成
- **THEN** 服务端发送 `{"type":"tool_result","name":"<tool_name>","result":"<formatted>","success":true|false}`
- **AND** 该事件在 `phase: responding` 之前

#### Scenario: text 事件

- **WHEN** LLM 生成回复文本
- **THEN** 服务端流式发送 `{"type":"text","content":"<chunk>"}`
- **AND** content 为增量文本片段

#### Scenario: done 事件

- **WHEN** 本轮对话完成
- **THEN** 服务端发送 `{"type":"done"}`
- **AND** 客户端结束流解析，清理 abortRef

### Requirement: Phase 状态机

客户端 SHALL 维护 phase 状态机，管理 thinking → executing → responding 三种阶段的 UI 展示。

#### Scenario: 思考阶段

- **WHEN** 客户端收到 `phase: thinking` 事件
- **THEN** 消息列表末尾的 assistant bubble 显示弹跳圆点动画 + "思考中" 文字
- **AND** 该阶段持续直到收到下一个 phase 事件或 done 事件

#### Scenario: 执行阶段

- **WHEN** 客户端收到 `phase: executing` 事件
- **THEN** assistant bubble 显示旋转图标 + 工具名称 + "执行中" 文字
- **AND** 后续的 `tool_call` 事件更新工具名称展示

#### Scenario: 回复阶段

- **WHEN** 客户端收到 `phase: responding` 事件
- **THEN** assistant bubble 切换到流式文本模式
- **AND** 每个 `text` 事件将 content 追加到 streamContentRef
- **AND** rAF 循环以 ~60fps 将 ref 内容同步到 streamText 状态

#### Scenario: 执行模式完整流程

- **WHEN** 执行模式下用户发送需要工具调用的消息
- **THEN** Phase 序列为: thinking → executing → responding → done
- **AND** 在 executing 阶段之间插入 tool_result 作为独立的 tool 消息卡片

#### Scenario: 执行模式无工具流程

- **WHEN** 执行模式下用户发送不需要工具调用的消息
- **THEN** Phase 序列为: thinking → responding → done
- **AND** 跳过 executing 阶段

#### Scenario: 探索模式流程

- **WHEN** 用户位于探索 Tab
- **THEN** Phase 序列为: thinking → responding → done
- **AND** 不出现 executing 阶段
- **AND** 不出现 tool_call / tool_result 事件

### Requirement: 客户端 SSE 解析

客户端 SHALL 使用 buffer + split 策略解析 SSE 流，保证不完整事件被正确处理。

#### Scenario: 正常解析

- **WHEN** 服务端发送完整的 SSE 事件流
- **THEN** 客户端按 `\n\n` 分割 buffer，提取 `data:` 前缀行
- **AND** JSON.parse 后 dispatch 到对应的事件处理器
- **AND** 最后一个不完整片段保留在 buffer 等待后续数据

#### Scenario: TCP 帧切分

- **WHEN** 一个 SSE 事件被 TCP 帧切分为多次 delivery
- **THEN** buffer 累积直到收到 `\n\n` 才触发解析
- **AND** 不产生 JSON.parse 错误

#### Scenario: 多事件合并

- **WHEN** 一个 TCP 帧包含多个完整 SSE 事件
- **THEN** 所有事件按序解析并 dispatch
- **AND** 处理顺序与服务端发送顺序一致

### Requirement: 工具结果实时插入

tool_result 事件 SHALL 立即在消息列表中插入 tool 消息卡片，不等待流结束。

#### Scenario: 工具结果卡片插入

- **WHEN** 客户端收到 `tool_result` 事件
- **THEN** 立即在消息列表末尾（assistant placeholder 之前）插入 role="tool" 的消息
- **AND** tool 消息渲染为 ToolResultCard 组件
- **AND** 卡片显示 toolName + 格式化结果文本

#### Scenario: 工具调用失败展示

- **WHEN** tool_result 的 success 为 false
- **THEN** ToolResultCard 显示错误样式
- **AND** 卡片内容为 "执行失败: {error_message}"

### Requirement: 流式文本渲染

回复阶段的文本 SHALL 以逐字流式效果渲染，使用 ref + requestAnimationFrame 模式避免 React 18 状态批量合并。

#### Scenario: 逐字渲染

- **WHEN** 收到 `text` 事件
- **THEN** content 追加到 streamContentRef.current（绕过 React 批量更新）
- **AND** rAF 循环每 ~16ms 将 ref 最新值复制到 streamText 状态
- **AND** AgentChat 的 MessageBubble 渲染 streamText + 闪烁光标

#### Scenario: 流结束

- **WHEN** 收到 `done` 事件
- **THEN** streamContentRef 写入最终值
- **AND** streamText 同步为最终值
- **AND** streaming 置为 false
- **AND** assistant bubble 移除闪烁光标
- **AND** 最终消息存入 messages 数组

### Requirement: Phase 间过渡

Phase 切换 SHALL 流畅过渡，不出现空白闪烁或状态跳跃。

#### Scenario: thinking → responding 过渡

- **WHEN** phase 从 thinking 变为 responding
- **THEN** 弹跳圆点平滑消失
- **AND** 流式文本从空开始逐字出现
- **AND** 不出现空白帧

#### Scenario: thinking → executing 过渡

- **WHEN** phase 从 thinking 变为 executing
- **THEN** 弹跳圆点替换为旋转图标 + 工具名
- **AND** 过渡在单帧内完成
