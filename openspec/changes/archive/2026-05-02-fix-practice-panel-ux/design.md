## Context

`fix-interview-stream-ux` 修复了流式架构和保存逻辑，但练习面板仍有三个交互 bug 导致端到端流程不可用。这些都是 React 状态管理和 UI 布局问题，不涉及 API 层变更。

## Goals / Non-Goals

**Goals:**
- 换题目时 PracticePanel 完全重建（清空 messages/sections/followUps 等全部状态）
- 面试风格选择器在配置区可见，与 JD 选择器、大厂预设同级
- 追问按钮发送时携带"这是面试官追问"的上下文

**Non-Goals:**
- 不改变 coach/stream API 或 stream-utils
- 不改变出题逻辑或问题列表组件
- 不改变已练列表或故事编辑器

## Decisions

### 1. Key 策略：用题目文本做 React key

**选择**：`key={activeQuestion.question}`

**理由**：
- 题目文本是自然的唯一标识，切换题目时 key 变化 → React 销毁旧组件 → 所有 state 清零
- 不需要新增 id 字段

**替代方案**：
- `key={JSON.stringify(activeQuestion)}` — 对象序列化可能不稳定
- 用 `useEffect` 监听 question 变化手动 `setMessages([])` — 容易遗漏状态字段

### 2. 风格选择器上移到配置区

**选择**：在 page.tsx 配置区新增一行 `mode` 选择器（与现有大厂预设的布局一致），从 PracticePanel 中移除内置 mode 选择器。

**布局变化**：
```
配置区:
  JD 选择器
  CV 状态
  大厂预设: [通用] [字节] [腾讯] [阿里]
  面试风格: [大厂] [外企] [管培] [中小企业] [初创] [国企]  ← 新增
  [生成面试题目]
```

**状态管理**：`coachMode` 保留在 page.tsx，传入 PracticePanel 作为初始值但不允许面板内修改。

**理由**：风格是配置级决策（跟你投什么类型的公司相关），不是题目级决策。跟 JD 选择器保持一致层级。

### 3. 追问发送格式

**选择**：点击追问按钮发送 `"面试官追问：「{question}」\n\n请帮我准备这个追问的回答，并结合之前的对话上下文。"`

**理由**：
- `「」` 明确标注这是面试官的话，不是用户说的话
- `请帮我准备` 告诉 AI 教练这是练习请求
- AI 能正确理解上下文并给出针对性指导

## Risks / Trade-offs

- **[风险] 用问题文本做 key 可能因为特殊字符出问题** → 缓解：React key 支持任意字符串，特殊字符不影响行为
- **[权衡] 风格选择器上移后，已进入练习的用户需要返回配置区才能切换风格** → 接受，因为风格是配置级决策，频繁切换本身就不合理
