## Why

练习面板存在三个 bug 导致核心流程不可用：换题不清历史消息、面试风格选择器放错层级、追问按钮以用户身份发送消息。这些问题使逐题练习流程断裂，用户无法正常完成"选题→回答→获反馈"的闭环。

## What Changes

- **修复换题消息残留**：PracticePanel 的 AnimatePresence key 从静态 `"practice"` 改为基于题目文本的 key，确保不同题目创建独立组件实例
- **面试风格选择器上移**：将 coach mode 选择器从 PracticePanel 内部移到主页面配置区，与 JD 选择器、大厂预设同级。配置区的 mode 状态控制练习时的教练 persona，不再在练习面板内切换
- **修复追问发送逻辑**：追问按钮点击后以 `"面试官追问：{问题文本}"` 的上下文形式发送，而非以用户原话发送

## Capabilities

### New Capabilities

（无——均为 bug 修复，不新增能力）

### Modified Capabilities

- `interview-prep-ui`: 练习面板组件行为变更——消息随题目切换重建、面试风格从面板内移除、追问按钮发送消息格式修正

## Impact

- `src/app/interview/page.tsx` — key 改为动态、配置区新增 mode 选择器、移除对 PracticePanel 的 mode/onModeChange 传参
- `src/app/interview/PracticePanel.tsx` — 移除内置 mode 选择器、修改 `handleFollowUpClick` 发送格式、移除 `mode`/`onModeChange` props
