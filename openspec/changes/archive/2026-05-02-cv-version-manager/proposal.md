## Why

CV 页面当前只有一套扁平 sections 数组自动存入 localStorage，没有版本概念、没有显式保存按钮、无法为不同岗位维护多份简历。更重要的是，评估 API 的「简历匹配」(Block B) 因无法读取 CV 数据而给出虚假评分。必须先把 CV 数据的版本管理和持久化基建搭好，后续的 AI 逐段优化 (`cv-ai-optimize`) 才有可靠的数据底座。

## What Changes

- 引入 CV 版本管理：支持创建、切换、重命名、删除多个简历版本，每个版本包含 5 个 section
- 将 CV 数据从单层 localStorage key 升级为版本化结构（`lingji-ai-cv`），确保旧数据平滑迁移
- CV 页面顶部增加版本选择器（下拉菜单 + 新建按钮）
- 增加显式「保存」按钮，替换当前无感的 auto-save 行为
- 暴露 `GET /api/cv` 端点，使评估 API 能从服务端读取活跃 CV 版本内容参与匹配
- 评估 API Block B 在无 CV 数据时不再捏造分数，改为显示「暂无简历数据」

## Capabilities

### New Capabilities

- `cv-version-storage`: CV 版本化的 localStorage 数据结构、迁移逻辑、读写操作
- `cv-data-api`: 服务端 CV 读取端点，供评估 API 和 PDF 生成使用
- `cv-version-ui`: 版本选择器 UI（下拉菜单、新建/重命名/删除）

### Modified Capabilities

- `cv-optimization-ui`: 新增版本管理交互（选择器 + 保存按钮），原「自动保存」改为显式保存
- `jd-evaluation-ui`: 评估报告 Block B 在无 CV 数据时展示占位提示而非虚假评分

## Impact

- **localStorage `lingji-ai-cv`**: 结构从 `CVSection[]` 升级为 `{ activeVersion: string, versions: Record<string, CVersion> }`（需迁移旧数据）
- **CV page `src/app/cv/page.tsx`**: 新增版本选择器、保存按钮；移除隐式 auto-save
- **新增 `src/app/api/cv/route.ts`**: GET 端点读取活跃 CV 版本
- **评估 API `src/app/api/evaluate/route.ts`**: Block B prompt 注入 CV 内容；无 CV 时调整输出
- **评估页面 `src/app/evaluate/page.tsx`**: Block B 无数据时渲染占位卡片
- **类型 `src/types/index.ts`**: 新增 `CVVersion` interface
