## 1. Phase 1 — 评估引擎中文化 (Core)

- [x] 1.1 创建 `modes/zh/_shared.md` — 中文评分引擎：A-F+Block G，中国薪资框架(RMB/税前税后/五险一金)，中国红线信号(996/竞业限制/试用期)，市场薪资数据源(脉脉/看准网/OfferShow)
- [x] 1.2 创建 `modes/zh/_profile.md` — 中文用户画像模板：6个AI非技术岗位archetype(产品/运营/解决方案/项目经理/咨询/增长)，自适应框架表格，中文谈判话术，RMB薪资目标
- [x] 1.3 创建 `modes/zh/jianzhi.md` — 中文核心评估工作流：A-G七块(A-职位概览/B-简历匹配/C-职级策略/D-薪资市场/E-定制计划/F-面试准备/G-职位真实性)，全部中文输出

## 2. Phase 2 — 辅助模式 (Auxiliary Modes)

- [x] 2.1 创建 `modes/zh/auto-pipeline.md` — 中文自动流水线：中文JD识别→路由到jianzhi.md→生成报告→PDF→追踪，中文平台URL处理
- [x] 2.2 创建 `modes/zh/pipeline.md` — 中文批量处理：读取pipeline.md中的中文URL列表，逐个通过auto-pipeline处理
- [x] 2.3 创建 `modes/zh/pdf.md` — 中文简历生成：中文字体声明(Noto Sans SC)，A4默认纸张，中文简历格式规范，照片/个人信息处理指南

## 3. Phase 3 — 基础设施适配 (Infrastructure)

- [x] 3.1 更新 `templates/states.yml` — 为每个canonical状态添加中文别名(已评估/已投递/已回复/面试中/已获Offer/已拒绝/已放弃/跳过)
- [x] 3.2 创建 `config/profile.example.zh.yml` — 中文版profile示例：RMB薪酬，中国城市，AI非技术岗archetype预设
- [x] 3.3 更新 `CLAUDE.md` — 添加中文模式检测指引：检测到中文JD时自动建议切换modes/zh/，跟随现有DE/FR/JA模式检测格式

## 4. 验证与整合 (Verify)

- [x] 4.1 运行 `node test-all.mjs` 确保所有语法检查通过，新增文件不破坏现有检查
- [x] 4.2 运行 `node verify-pipeline.mjs` 确认中文状态别名被正确识别
- [x] 4.3 手动测试：贴一个中文JD URL，验证从评估到报告的全流程
