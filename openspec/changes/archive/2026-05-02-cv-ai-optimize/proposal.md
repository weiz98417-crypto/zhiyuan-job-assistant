## Why

当前 CV 页面的每个 section（个人概述、工作经历、项目经验等）只能手动编辑，用户需要自行思考如何改写才能使简历更专业。借鉴 Suno AI 歌词编辑器的「多版本生成 → 对比 → 选用/放弃」UX 模式，让每个 section 可以一键生成 3 个不同方向的 AI 改写方案，用户只需选择最好的那个。`cv-version-manager` 已完成版本管理基建，现在可以在其基础之上实现逐段 AI 优化体验。

## What Changes

- 每个 section 卡片右下角新增 `✨ AI 优化` 按钮，点击展开优化面板
- 优化面板包含：可选优化意图输入框、改写激进程度滑块（1-10）、关键词密度滑块（1-10）
- 点击「生成方案」后，AI 同步生成 3 个改写变体：激进化（A）、保守化（B）、定向化（C，仅当已选择 JD 配对时）
- 方案以卡片列表展示，用户可选用任一方案替换原文，或放弃保留原文
- 新增 `POST /api/cv/optimize-section` API 端点
- 全局优化上下文：将 UserProfile 注入 prompt，确保 5 个 section 语气一致
- 同一时间只允许展开一个优化面板
- 选用方案后自动显示绿闪动画，保存为优化来源标记（`source: "optimized"`）

## Capabilities

### New Capabilities

- `cv-section-optimize-api`: AI 逐段优化 API（3 方案生成、意图 + 双滑块控制、多段上下文拼接）
- `cv-section-optimize-ui`: 优化面板 UI（展开/收起、意图输入、双滑块、3 方案卡片、选用/放弃操作）
- `cv-optimize-context`: 优化上下文管理（UserProfile 注入保持语气一致、JD 配对检测触发方案 C）

### Modified Capabilities

- `cv-optimization-ui`: section 卡片新增优化按钮和面板交互；优化结果自动保存到当前版本并标记 source

## Impact

- **新增 API** `POST /api/cv/optimize-section` — AI 优化端点，调用 DeepSeek
- **CV 页面 `src/app/cv/page.tsx`** — section 卡片内嵌优化面板、滑块、方案选择交互
- **cv-storage `src/lib/cv-storage.ts`** — 优化后保存时标记 `source: "optimized"`
- **类型 `src/types/index.ts`** — 新增 `OptimizeRequest`、`OptimizeResponse` 类型
- 依赖 `cv-version-manager` 已完成的版本系统
