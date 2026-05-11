## 1. SQLite Schema & 后端基础设施

- [x] 1.1 在 `server-schema.sql` 新增 `reference_resumes` 表和 FTS5 虚拟表及同步触发器
- [x] 1.2 在 `server-schema.sql` 新增 `optimization_preferences` 表
- [x] 1.3 在 `server-db.ts` 新增 reference_resumes CRUD 函数（insertReferenceResume, listReferenceResumes, getReferenceResume, deleteReferenceResume）
- [x] 1.4 在 `server-db.ts` 新增 FTS5 检索函数 `searchReferenceResumes(query: string, limit?: number)`
- [x] 1.5 在 `server-db.ts` 新增 optimization_preferences 读写函数（recordPreference, getRecentPreferences）

## 2. 参考简历导入 API

- [x] 2.1 新增 `POST /api/cv/import-reference` — 支持 PDF/图片上传（AI 解析）和文本粘贴，写入 reference_resumes
- [x] 2.2 新增 `GET /api/cv/references` — 返回参考简历列表（不含完整 sections_json）
- [x] 2.3 新增 `GET /api/cv/references/[id]` — 返回单份参考简历完整内容（含 sections）
- [x] 2.4 新增 `DELETE /api/cv/references/[id]` — 删除参考简历及 FTS5 索引

## 3. CV 页面 JD 上下文强化显示 (P0)

- [x] 3.1 重构右侧面板顶部：将 `<select>` 下拉框替换为 JD 信息卡片组件（公司、职位、关键词 pills、匹配度、更换按钮）
- [x] 3.2 未选择 JD 时显示引导占位卡片
- [x] 3.3 JD 卡片与下方匹配详情联动（选中 JD 后自动展开匹配分析）

## 4. OptimizePanel JD 上下文透传 (P1)

- [x] 4.1 OptimizePanel 顶部新增 JD 摘要行："优化目标：{company} — {role}"（无 JD 时显示"通用优化"）
- [x] 4.2 激进程度 slider 下方添加提示文案："针对 JD 要求进行措辞调整"
- [x] 4.3 关键词密度 slider 下方显示当前 JD 前 6 个关键词 pills

## 5. 参考简历库 UI (P0)

- [x] 5.1 在 CV 页面右侧面板新增"参考简历"折叠区域，列出已导入简历（名称、标签、来源图标）
- [x] 5.2 添加"导入参考简历"入口：上传 PDF / 粘贴文本 两个 tab
- [x] 5.3 导入后展示 AI 解析结果，允许用户编辑修正后再保存
- [x] 5.4 支持展开查看单份参考简历的 section 预览
- [x] 5.5 支持删除参考简历（确认对话框）

## 6. 版本对比 Diff (P1)

- [x] 6.1 实现 `diffVersions()` 工具函数：按 section 对齐，逐行对比，输出 added/removed/same 数组
- [x] 6.2 创建 VersionDiff 组件：左右两栏布局，绿色/红色高亮差异行
- [x] 6.3 版本选择器添加"对比"按钮，选中两个版本后进入 diff 视图
- [x] 6.4 底部变更统计：新增/删除句子数、量化表述变化 badge
- [x] 6.5 "返回编辑"和"设为此版本"操作按钮

## 7. 参考简历辅助优化 (P2)

- [x] 7.1 OptimizePanel 新增"参考风格（可选）"区域，展示可勾选的参考简历列表
- [x] 7.2 默认自动勾选 FTS5 匹配度最高的前 3 份（无参考简历时显示导入引导）
- [x] 7.3 修改 `POST /api/cv/optimize-section`：接收 `referenceIds: number[]` 参数，从 reference_resumes 提取对应 section 内容，拼入 LLM prompt 的"参考范例"区域
- [x] 7.4 prompt 模板更新：新增"参考范例"区域，与 JD 关键词区域并列

## 8. AI 偏好学习 (P2)

- [x] 8.1 新增 `POST /api/cv/record-preference` — 记录 accept/reject 事件
- [x] 8.2 OptimizePanel 中 accept 按钮调用 record-preference API
- [x] 8.3 OptimizePanel 关闭时记录隐式 reject（已展示但未接受的 variant）
- [x] 8.4 修改 optimize-section prompt：附带最近 10 条偏好历史
