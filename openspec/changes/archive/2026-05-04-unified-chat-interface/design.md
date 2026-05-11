## Context

当前纸鸢 Agent 页面有两个 Tab（探索/执行），用户体验分裂。探索模式报 400 错误，且两个模式的 System Prompt 完全不同——一个纯聊天，一个有工具。用户期望一个统一的聊天入口，agent 自己判断场景。

约束：(1) 保持 SSE 事件协议不变，(2) 保持 PlanCard + 工具结果渲染不变，(3) 保持探索模式的核心能力（聊天引导、画像分析），(4) 复用现有 AgentChat 组件。

## Goals / Non-Goals

**Goals:**
- 去掉探索/执行 Tab 切换，单输入框 + 统一聊天
- 输入框上方放置快捷操作卡片（Suggestion Chips）
- System Prompt 合并：Agent 同时具备聊天引导 + 工具调用能力
- 代码精简：移除 tab URL 参数、双模式分支、重复组件

**Non-Goals:**
- 不改 PlanCard 渲染逻辑
- 不改工具系统
- 不改 SSE 事件协议
- 不改侧边栏 ProfilePanel（保留但可选展示）

## Decisions

### 1. 页面布局

```
┌──────────────────────────────────────────────┐
│  纸鸢 Agent — AI 求职伙伴                      │
├──────────────────────────────────────────────┤
│                                              │
│  消息列表                                     │
│  ├ 用户消息                                   │
│  ├ PlanCard (有任务时)                        │
│  ├ 工具结果卡片                                │
│  └ assistant 回复                             │
│                                              │
├──────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ 📋 查投递  │ │ 📊 评估JD │ │ 💡 推荐岗位 │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ 🏥 健康检查│ │ 📝 生成简历 │ │ 📎 导出文件 │     │
│  └──────────┘ └──────────┘ └──────────┘     │
├──────────────────────────────────────────────┤
│  [____________________输入框________________] │
└──────────────────────────────────────────────┘
```

### 2. Suggestion Chips 设计

```typescript
interface SuggestionChip {
  icon: string;       // emoji 或 lucide icon name
  label: string;      // "查投递"
  prompt: string;     // 点击后自动填充的提示语
}

const DEFAULT_SUGGESTIONS: SuggestionChip[] = [
  { icon: "📋", label: "查投递", prompt: "帮我查一下最近的投递记录" },
  { icon: "📊", label: "评估JD", prompt: "帮我评估一个JD: " },
  { icon: "💡", label: "推荐岗位", prompt: "根据我的画像推荐几个适合的岗位" },
  { icon: "🏥", label: "健康检查", prompt: "检查一下我的Pipeline健康状态" },
  { icon: "📝", label: "生成简历", prompt: "根据我的画像生成一份简历" },
  { icon: "📎", label: "导出报告", prompt: "帮我生成一份求职进展报告并导出" },
];
```

**点击行为**：填充 prompt 到输入框，不自动发送。用户可以编辑后再发送。

### 3. System Prompt 合并

不再区分 explore/execute mode。统一 System Prompt：

```
你是纸鸢，AI 求职伙伴。

聊天能力：
- 和用户自然对话，了解他们的背景、偏好、顾虑
- 逐步帮用户理清职业方向
- 保持温暖、专业、不 push

执行能力：
- 有工具可以查询投递、评估JD、推荐岗位、导出文件
- 需要数据时主动调用工具
- 复杂任务拆成计划，逐项执行
- 不需要工具时直接回复

判断原则：
- 用户问事实/数据 → 调工具
- 用户聊感受/方向 → 聊天引导
- 不确定 → 追问一句
```

### 4. 代码变化

```
删除:
  - explore/execute Tab 切换逻辑
  - ?tab= URL 参数
  - switchTab() 函数
  - EXPLORE_WELCOME / EXECUTE_WELCOME 常量
  - mode 相关的条件分支

新增:
  - SuggestionChips 组件
  - suggestions prop 传递到 AgentChat
  - 统一欢迎消息

保留:
  - PlanCard、TaskItem、AgentChat、MessageBubble
  - Phase 可视化
  - SSE 事件解析
  - ProfilePanel (可选展示)
```

### 5. 过渡期设计

`/api/agent/chat` 暂时保留 mode 参数（向后兼容），但前端不再发送 mode。服务端根据是否传 mode 来决定行为：传了就按旧逻辑，没传就走统一模式。

## Risks

- [失去探索模式的独立人格] 统一的 System Prompt 可能让 agent 在"聊天"和"执行"之间摇摆 → 缓解：System Prompt 明确判断原则
- [Suggestion Chips 不够灵活] 固定卡片不能满足所有需求 → 缓解：卡片可配置，后续可做动态推荐
