## Context

当前系统从"用户已经知道目标岗位"的假设出发——JD 评估、简历匹配、面试准备都依赖这个前提。但实际上很多求职者卡在更早的阶段：他们缺乏自我认知框架，说不清自己适合什么工作。

现有基础设施：
- DeepSeek API（`deepseek-v4-flash`）已在多个 API 路由中使用，但全是 `response_format: json_object` 非流式
- 前端无流式消费逻辑，组件体系已有 PaperCard / WarmButton / HandwritingTitle / framer-motion
- `config/profile.yml` 和 `modes/_profile.md` 是用户画像的持久化目标
- AppShell 导航已有 evaluate / cv / discover / tracker / interview / compare / analytics / settings 八个页面

## Goals / Non-Goals

**Goals:**
- 在根目录新增 `/explore` 路由，提供流式 AI 聊天界面
- `/api/chat/stream` 代理 DeepSeek SSE 流式响应
- `/api/chat/summarize` 从对话历史提取结构化 JSON 画像
- 用户点击"帮我总结"触发提取，侧边栏展示结果
- 总结结果可一键写入 `config/profile.yml` 和 `modes/_profile.md`
- 设计沿用现有 PaperCard / WarmButton / HandwritingTitle 组件体系

**Non-Goals:**
- 不引入 Vercel AI SDK 或其他第三方流式库（裸 fetch + ReadableStream 足够）
- 不做实时侧边栏提取（仅在用户主动点击"帮我总结"时提取）
- 不做多轮对话的自动触发（用户手动点总结）
- 不修改现有 `/discover` 页面（职位扫描是独立功能）
- 不做对话历史的服务端持久化（前端 state + localStorage）

## Decisions

### 1. 流式方案：原生 fetch + ReadableStream 消费 SSE

DeepSeek API 与 OpenAI SSE 格式兼容。服务端用 `fetch` 设置 `stream: true`，将响应 body pipe 为 `ReadableStream`。前端用 `response.body.getReader()` 逐块读取，追加入当前 AI 消息的 content。

**对比**：引入 Vercel AI SDK 多一个依赖，且 DeepSeek 不是它的第一方支持。裸 fetch 100 行以内解决，可控性更好。

### 2. 两阶段架构：Chat（流式）+ Summarize（非流式 JSON）

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ 阶段一：聊天  │────▶│ 阶段二：归纳   │────▶│ 持久化：写入   │
│ stream:true │     │ json_object  │     │ profile.yml  │
│ 打字机效果    │     │ 结构化提取     │     │ _profile.md  │
└─────────────┘     └──────────────┘     └──────────────┘
```

**理由**：聊天需要流式体验，但结构化提取需要精确 JSON。DeepSeek 不支持 `stream: true` + `response_format: json_object` 同时使用（流式下 JSON 可能被截断）。分离两个端点各司其职。

### 3. AI 引导策略：系统 Prompt 内嵌访谈框架

不把"该问什么问题"写成前端逻辑，而是写到 chat/stream 的 system prompt 里。AI 被指示扮演求职顾问，按维度逐步探索：

1. **经验梳理**（过往工作/项目/实习）
2. **技能盘点**（硬技能 + 软技能 + 独特优势）
3. **价值偏好**（喜欢/不喜欢什么样的工作环境）
4. **硬约束**（薪资底线 / 地点 / 工作时长 / 公司类型）
5. **职业方向**（基于以上信息提出 2-3 个可能方向讨论）

Prompt 引导 AI 每轮只问 1-2 个问题，不连珠炮。当用户表达"不知道"时，给具体选项帮助锚定。

### 4. Summarize API：多轮对话 → 结构化画像

```
输入：messages[] (完整对话历史)
输出：
{
  "targetRoles": [{ "title": "AI后端工程师", "confidence": 85, "reasoning": "..." }],
  "skills": { "core": [...], "secondary": [...], "advantage": "..." },
  "preferences": { "companyType": [...], "industry": [...], "culture": "..." },
  "constraints": { "salary": "...", "location": "...", "hours": "...", "other": [...] },
  "narrative": "一段自然的求职叙事文案",
  "archetype": "匹配的 archetype 类型"
}
```

这个输出可以直接映射到 `config/profile.yml` 和 `modes/_profile.md` 的字段结构。

### 5. 对话历史存储：useState + localStorage

聊天消息存在组件 state 中，对话结束后可选保存到 localStorage。不做服务端存储（隐私考虑 + 简化架构）。页面刷新后从 localStorage 恢复。

### 6. 页面布局：聊天区 + 可收起的侧边栏

```
┌── 聊天区 (flex-1) ───────────────┬── 侧边栏 (w-80, togglable) ──┐
│ header: 🧭 需求探索 + [总结] [重置] │  📋 求职画像                  │
│ messages: [...]                   │  ├ 目标方向                   │
│ input: [................] [发送]   │  ├ 技能清单                   │
│                                   │  ├ 偏好 & 约束                │
│                                   │  └ [保存到档案]               │
└───────────────────────────────────┴──────────────────────────────┘
```

侧边栏初始隐藏，点击"帮我总结"后出现并展示提取结果。用户可关闭侧边栏继续聊天。

## Risks / Trade-offs

- **DeepSeek 流式偶有断连** → 前端 reader 监听 `done` 状态，done 时自动标记消息完成；异常时显示重试按钮
- **总结 JSON 解析失败** → 复用现有 evaluate API 的 fallback（正则提取 markdown code block 中的 JSON）
- **聊天历史过长导致 token 溢出** → Summarize 前截取最近 20 轮对话；Stream API 限制 messages 数组长度
- **用户数据隐私** → 消息仅存 localStorage，不上传服务器（API 路由仅转发，不存储）
