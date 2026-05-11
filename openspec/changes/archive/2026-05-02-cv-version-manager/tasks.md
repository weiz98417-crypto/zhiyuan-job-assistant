## 1. 类型扩展

- [x] 1.1 在 `types/index.ts` 中新增 `CVersion` 和 `CVData` interface
- [x] 1.2 在 `EvaluateRequest` 中新增 `cvText?: string` 字段

## 2. CV 版本存储

- [x] 2.1 创建 `src/lib/cv-storage.ts`，实现版本化数据的读写函数（`loadCVData`, `saveCVData`, `getActiveSections`, `createVersion`, `deleteVersion`, `switchVersion`, `renameVersion`）
- [x] 2.2 实现旧数据迁移逻辑：首次加载检测旧 `CVSection[]` 格式，自动包装为 `CVData`
- [x] 2.3 实现未保存更改检测（对比当前 sections 与上次保存状态）

## 3. CV API 端点

- [x] 3.1 创建 `src/app/api/cv/route.ts`（GET），接收 sections 并返回 `fullText` 拼接结果
- [x] 3.2 评估 API `/api/evaluate` prompt 注入 `cvText` 字段支持；无 CV 时 Block B 输出占位文本而非捏造分数

## 4. 版本选择器 UI

- [x] 4.1 CV 页面顶部增加版本选择器下拉菜单（版本列表 + 当前活跃版本高亮 + 删除按钮）
- [x] 4.2 实现新建版本功能（内联输入或小型模态框，默认名称「新版本」）
- [x] 4.3 实现重命名功能（下拉菜单中双击版本名进入编辑）
- [x] 4.4 实现删除版本功能（至少保留一个，删除活跃版本时自动切换）

## 5. 保存行为改造

- [x] 5.1 移除 auto-save 逻辑，改为编辑后激活「保存」按钮
- [x] 5.2 实现保存按钮（点击写回 localStorage，保存后按钮恢复灰色）
- [x] 5.3 切换版本前检测未保存更改，弹窗确认

## 6. 评估页面适配

- [x] 6.1 前端 `handleSubmit` 从 localStorage 读取 `lingji-ai-cv`，提取活跃版本 sections 拼接为 `cvText` 传入 API
- [x] 6.2 评估报告 Block B 在无 CV 数据时展示占位提示卡片（「尚未提供简历数据」+ 「完善简历 →」链接按钮）

## 7. 集成验证

- [x] 7.1 TypeScript 类型检查通过
- [ ] 7.2 手动测试：创建多版本、切换、重命名、删除、保存
- [ ] 7.3 手动测试：旧数据迁移（在控制台重置 `lingji-ai-cv` 为旧格式后刷新页面）
- [ ] 7.4 手动测试：无 CV 时评估 JD，Block B 显示占位提示
