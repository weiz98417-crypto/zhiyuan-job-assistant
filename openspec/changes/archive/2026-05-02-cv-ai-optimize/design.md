## Context

`cv-version-manager` 已完成版本管理基建，CV 页面现在有版本选择器、保存按钮、新旧数据迁移。当前每个 section 的编辑仍然是纯手动 textarea。用户需要 AI 辅助优化每个 section 的内容。

参考文档 `openspec/plans/cv-ai-optimize-design.md` 已将 Suno AI 歌词编辑器的 7 个 UX 模式映射到 CV 优化场景。本次实现只聚焦逐段优化核心体验（模式 1-3），将模式 4-7 的内核也纳入（意图输入、双滑块、UserProfile 上下文、放弃路径）。

## Goals / Non-Goals

**Goals:**
- 每个 section 卡片右下角有 `✨ AI 优化` 按钮，点击展开内嵌优化面板
- 优化面板：可选意图输入框 + 改写激进程度滑块 + 关键词密度滑块
- 生成 2-3 个改写方案（A 激进、B 保守、C 定向仅当已选 JD）
- 用户选用任一方案替换原文，或放弃保留原文
- UserProfile + 全量 CV 内容拼入 prompt 保持语气一致
- 同一时间只允许展开一个优化面板
- 选用后自动保存并标记 source 为 "optimized"

**Non-Goals:**
- 版本差异对比
- 优化历史回溯（仅依赖版本管理）
- 流式输出（3 个短方案并行生成，2-3 秒可接受）

## Decisions

### Decision 1: API 设计 — 单个端点 vs 并行请求

选用**单次请求一次返回 3 个方案**：

```
POST /api/cv/optimize-section

Request:
{
  sectionId: "experience",
  sectionContent: "原文...",
  fullCV: { sections... },
  intent?: "强调架构设计",
  aggressiveness: 3,      // 1-10
  keywordDensity: 5,      // 1-10
  targetJD?: { role, company, keywords },
  userProfile: { headline, superpowers, targetRoles }
}

Response:
{
  variants: [
    { label: "激进", content: "...", approach: "大幅重构..." },
    { label: "保守", content: "...", approach: "精修措辞..." },
    { label: "定向", content: "...", approach: "..." }  // 仅当有 targetJD
  ]
}
```

**理由**: 3 个方案生成量都不大（每段 100-300 字），单次请求一次返回比 3 次并行请求更简单，prompt 中可以明确标注 3 个 variant 确保差异化。

### Decision 2: 模型选择

`deepseek-v4-flash` — 轻量快速，非流式。单次请求 2-4 秒可接受。与评估 API 使用同一模型。

### Decision 3: 优化面板状态管理

用组件内部 state 管理面板状态，不提升到页面级：

```typescript
interface OptimizePanelState {
  isOpen: boolean;
  intent: string;
  aggressiveness: number;
  keywordDensity: number;
  variants: OptimizeVariant[] | null;
  loading: boolean;
  error: string | null;
}
```

每个 section 卡片独立管理自己的面板状态。同一时间只展开一个面板通过页面级 `activeOptimizeSection` state 控制。

### Decision 4: 方案 C 的触发条件

前端检查 `selectedReport` 是否存在（CV 页面右侧已选 JD 配对）：
- 有 `selectedReport` → 提取 role, company, keywords 传入 API → 生成方案 A+B+C
- 无 `selectedReport` → 不传 targetJD → 生成方案 A+B

不在 API 端做判断，由前端决定是否请求方案 C。

### Decision 5: 优化后保存

用户点击「选用此方案」→ 更新对应 section 的 content → 设置 dirty 状态（保存按钮激活）。用户手动点击保存时，`source` 自动标记为 `"optimized"`。这样与版本管理系统的保存流程一致。

### Decision 6: 滑块设计

用 CSS range input 风格 + 文字标签：

```
改写激进程度:  [●═══░░░░░] 3 → 偏保守
关键词密度:    [░░●●══░░░] 5 → 适度植入
```

刻度 1-10，默认值：激进度 3（偏保守），关键词密度 5（适中）。数值旁的标签根据当前值动态变化。

## Risks / Trade-offs

- **[Risk] AI 生成内容可能偏离事实** → 滑块的"保守"模式默认更安全（仅润色措辞不改结构）。激进模式 slider 上有明确标注。
- **[Risk] DeepSeek API 偶尔超时** → 前端 10s 超时 + 错误提示 + 重试按钮
- **[Trade-off] 非流式输出** → 用户体验稍差（2-4s 等待），但实现简单，CV 内容短，可接受
- **[Trade-off] 独立 API 端点** → 比复用 /api/chat 更专注，prompt 可定制化，但增加了一个路由文件
