## Context

当前系统有三层画像数据：

| 层 | 来源 | 当前状态 |
|---|---|---|
| Layer 1 | `config/profile.yml`（用户声明） | 仍是模板"张三"数据 |
| Layer 2 | `profile_signals` 表（对话信号） | **0 行**——信号提取依赖 AI 调 `mine_profile` 工具，模型经常跳过 |
| Layer 3 | `applications` + `reports`（行为统计） | 仅 1 条投递，0 份报告 |

画像页展示 `ZhiyuanProfile` 结构（skills / preferences / marketFit / goals / history），但大部分可视化被报告次数门槛锁住（3-5 次），新用户看到的是裸分数。

Agent Chat 中 15 个工具通过 `ToolResultCard` 展示，toolName 直接渲染英文名，无中文本地化。

## Goals / Non-Goals

**Goals:**
- 信号提取不依赖 AI 决策，系统自动在每次对话后扫描用户消息
- 对话结束/切换会话时自动触发画像分析（force: true）
- 画像页以"情报摘要"形式展示具体事实（目标、技能、底线、偏好），分数为辅助
- 工具名中文化显示，15 个工具全部映射

**Non-Goals:**
- 不修改 `profile_signals` 表结构
- 不修改 DeepSeek API 调用侧
- 不修改移动端 Agent 页布局
- 不改变 settings 页的 profile.yml 编辑功能

## Decisions

### Decision 1: 客户端信号扫描 vs 服务端信号扫描

**选择: 客户端扫描**（在 `agent/page.tsx` 的 `sendMessage` 中）

理由：
- 用户消息已在内存中，无需额外网络请求
- 轻量正则 + 关键词匹配，不增加用户感知延迟
- 批量写入 `/api/data/signals/batch` 减少请求次数

备选方案：服务端在 `/api/agent/loop` 中扫描——但需要等服务端 Agent 循环完成，延迟更大且耦合度高。

### Decision 2: 信号扫描触发时机

在以下时机触发扫描：
1. 每条用户消息发送后（JD 评估路径和非评估路径均扫描）
2. 对话切换/新建/删除会话时（触发画像更新 `force: true`）

提取的信号类型：

| 信号类型 | 匹配模式 | 示例 |
|---|---|---|
| `skill_claim` | "我擅长/会/做过/精通/熟悉 + 名词" | "我做过3年AI产品" |
| `role_preference` | "我想做/目标是/考虑转 + 岗位名" | "我目标是AI产品负责人" |
| `dealbreaker` | "不接受/不考虑/排斥/拒绝 + 条件" | "996的不考虑" |
| `company_pref` | 公司名 + 正面/负面情绪词 | "字节挺好" / "外包不去了" |
| `salary_expectation` | 数字 + k/K/千/万 + 薪资语境 | "最少40k" |

### Decision 3: 画像页布局方案

**选择: "情报摘要"卡片流**

```
┌─────────────────────────────────────┐
│  求职画像                           │
│                                     │
│  ┌─ 目标方向 ────────────────────┐  │
│  │ 标签云 + 来源标注              │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌─ 核心技能 (从对话提取) ───────┐  │
│  │ 技能标签 + proficiency 条     │  │
│  │ 每个标注来源和证据数           │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌─ 底线条件 ────────────────────┐  │
│  │ 带 ✗ 图标的列表               │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌─ 偏好信号 ────────────────────┐  │
│  │ 细分：公司/行业/薪资          │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌─ 竞争力概览 ──────────────────┐  │
│  │ 进度条 + 等级 + 维度分解      │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌─ 最近活动 ────────────────────┐  │
│  │ 时间线（从 history 读取）     │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

**展示门槛降低:**

| 模块 | 旧门槛 | 新门槛 |
|---|---|---|
| 技能雷达 | 3 份报告 | 1 份报告或 3 项技能 |
| 技能缺口 | 5 份报告 | 2 份报告或已有缺口数据 |
| 偏好分布 | 5 份报告 | 有偏好数据即显示 |

**分数展示增强:**
- 等级标签：0-20 起步 / 21-40 积累中 / 41-60 有一定竞争力 / 61-80 具备竞争力 / 81-100 高度匹配
- 简短说明文案：这个分数是怎么来的
- 维度分解条（技能匹配 / 经验相关 / 市场需求 / 偏好清晰度）

### Decision 4: 工具名映射方案

集中映射表 `frontend/src/lib/agent/tool-display-names.ts`：

```typescript
export const TOOL_DISPLAY: Record<string, { label: string; emoji: string }> = {
  search_applications:  { label: "搜索投递记录", emoji: "📋" },
  // ... 15 total
};

export function getToolDisplay(toolName: string) {
  return TOOL_DISPLAY[toolName] || { label: toolName, emoji: "🔧" };
}
```

在 `ToolResultCard` 和 `ExecutingIndicator` 中调用 `getToolDisplay()`，显示 `{emoji} {label}` 替代原始 toolName。

## Risks / Trade-offs

- [Risk] 客户端正则信号扫描可能误提取（如"我不会Java"被提取为 Java 技能）→ 服务端 LLM 在画像分析时会过滤低质量信号
- [Risk] 批量信号写入增加 `/api/data/signals/batch` 端点 → 低风险，简单 CRUD
- [Risk] 画像页重设计需要处理空状态（无信号/无报告） → 每个卡片设计 empty placeholder 引导文案
- [Trade-off] 降低雷达图门槛可能导致数据不足时图形不好看 → 雷达图组件已有 `minValues` 参数处理
