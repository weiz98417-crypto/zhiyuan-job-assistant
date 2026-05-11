## Why

简历管理页当前只有「编辑 + JD 关键词匹配 + AI 单段优化」三个基础功能，缺少优秀简历参考、JD 优化上下文可视化和版本对比能力。用户在 AI 优化时不知道"激进程度/关键词密度"的参照 JD 是什么，也无法导入行业中优秀简历作为 AI 优化的风格参考。这导致 AI 优化输出千篇一律，缺少对"好简历长什么样"的持续学习积累。

## What Changes

- **JD 上下文强化显示**：右侧面板新增持久化的 JD 信息卡片（公司、职位、核心关键词、匹配度），替代当前单一 `<select>` 下拉框，让用户始终知道当前优化针对哪个 JD
- **参考简历库（SQLite FTS5）**：新增 `reference_resumes` 表 + FTS5 全文索引，支持上传 PDF/图片（AI 解析）或手动粘贴导入优秀简历；采用 Karpathy 范式——FTS5 做关键词粗筛，LLM 直接读原文做精排，不引入向量数据库。数据全部存后端 SQLite
- **OptimizePanel JD 上下文透传**：优化面板打开时顶部展示当前 JD 摘要，slider 旁标注"当前针对：XX 公司 — XX 岗位"，参数不再悬空
- **版本对比 diff**：同份简历的两个版本左右并排对比，高亮差异行，底部统计变更摘要（+N 项量化表述, -M 项弱动词）
- **参考简历辅助优化**：优化 API 除了 JD 关键词，额外 FTS5 检索 5 份最相关参考简历段落喂给 LLM 作为风格参考；与现有「AI 优化」按钮互补——激进程度/关键词密度针对 JD 侧，参考简历选择针对表达风格侧
- **AI 偏好学习**：记录用户在优化面板中的 accept/reject 选择到 SQLite，后续优化 prompt 附带最近偏好历史，让 AI 逐渐适配用户风格

## Capabilities

### New Capabilities

- `reference-resume-library`: 参考简历的导入（PDF/图片/粘贴）、存储（SQLite FTS5）、浏览、搜索、删除。与主简历数据模型同构（分段存储），支持按 section 粒度检索
- `cv-version-diff`: 同份简历两个版本的并排对比，行级差异高亮，变更统计摘要（量化数变化、关键词覆盖变化、结构变化）

### Modified Capabilities

- `cv-optimization-ui`: 新增 JD 上下文持久化展示要求；OptimizePanel 开源时需展示 JD 摘要；新增参考简历勾选区域；新增 accept/reject 偏好记录要求
- `sqlite-backend`: 新增 `reference_resumes` 表（id, name, source, sections_json, raw_text, tags, notes, created_at）及 FTS5 虚拟表；新增 `optimization_preferences` 表记录 accept/reject 事件

## Impact

- **前端**: `frontend/src/app/cv/page.tsx`（右侧面板重构）、`frontend/src/app/cv/optimize-panel.tsx`（JD 上下文 + 参考简历选择）
- **新增前端**: `frontend/src/app/cv/reference-library.tsx`（参考简历库面板）、`frontend/src/app/cv/version-diff.tsx`（版本对比组件）
- **API**: 新增 `POST /api/cv/import-reference`（PDF/图片解析导入）、`GET /api/cv/references`（参考简历列表+搜索）、`DELETE /api/cv/references/:id`、修改 `POST /api/cv/optimize-section`（增加参考简历上下文 + FTS5 检索）、新增 `POST /api/cv/record-preference`（记录 accept/reject）
- **后端**: `frontend/src/lib/server-db.ts`（新增表 + FTS5 索引）、`frontend/src/lib/server-profile-engine.ts` 同级新增参考简历解析逻辑
- **数据库**: SQLite schema migration，新增两张表，无破坏性变更
