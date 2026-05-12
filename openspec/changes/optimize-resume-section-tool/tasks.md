## 1. 工具创建

- [x] 1.1 新建 `frontend/src/lib/agent/tools/action/optimize-resume-section.ts`
- [x] 1.2 handler: GET `/api/cv/data` → 提取 section → POST `/api/cv/optimize-section` → 返回改写方案
- [x] 1.3 formatResult: 展示原文 vs 改写后对比，附说明文字

## 2. 注册 + 路由修复

- [x] 2.1 `tools/index.ts`: import + registry.register()
- [x] 2.2 `resume-agent.ts`: toolNames 加 `"optimize_resume_section"`
- [x] 2.3 `resume-agent.ts`: intentPatterns 加 `/优化|改写|润色/`（不强制带"简历"关键词）

## 3. 验证

- [x] 3.1 发送"优化我的工作经历" → `optimize_resume_section` 被调用 → 返回改写方案
- [x] 3.2 发送"改写技能栏" → 同上
- [x] 3.3 数据走 SQLite 读写而非 localStorage
