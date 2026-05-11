## 1. API 端点 — 服务端桥接

- [x] 1.1 新建 `frontend/src/app/api/agent/scan-risks/route.ts` — spawn `node scripts/scan-risks.mjs --jd-text "..."` 并返回 JSON
- [x] 1.2 新建 `frontend/src/app/api/agent/decode-terms/route.ts` — 读 `modes/zh/risk-intel.md` YAML，匹配 phrase
- [x] 1.3 新建 `frontend/src/app/api/agent/fetch-jd/route.ts` — fetch URL 提取纯文本 JD 内容

## 2. evaluate_jd_full 工具

- [x] 2.1 新建 `frontend/src/lib/agent/tools/action/evaluate-jd-full.ts`
- [x] 2.2 实现 handler：URL 抓取（如需）→ 风险扫描 → A-G 评分 → 校验 → 入库
- [x] 2.3 实现 formatResult：结构化 Markdown 报告（公司/岗位/分数/风险表格）
- [x] 2.4 参数定义：`jd_text` (string, optional), `jd_url` (string, optional)

## 3. analyze_jd_risks 工具

- [x] 3.1 新建 `frontend/src/lib/agent/tools/action/analyze-jd-risks.ts`
- [x] 3.2 实现 handler：POST `/api/agent/scan-risks`，返回信号列表
- [x] 3.3 实现 formatResult：风险表格 + 加权总分 + 综合等级
- [x] 3.4 参数定义：`jd_text` (string, required)

## 4. decode_black_market_terms 工具

- [x] 4.1 新建 `frontend/src/lib/agent/tools/query/decode-terms.ts`
- [x] 4.2 实现 handler：POST `/api/agent/decode-terms`，返回匹配词条
- [x] 4.3 实现 formatResult：emoji + term → meaning 列表
- [x] 4.4 参数定义：`phrase` (string, required)

## 5. 注册

- [x] 5.1 修改 `frontend/src/lib/agent/tools/index.ts`——import 3 个新工具 + `registry.register()` 3 条

## 6. 验证

- [x] 6.1 发送"评估这个 JD: [文本]" → `evaluate_jd_full` 被调用 → 返回风险表格 + A-G 评分
- [x] 6.2 发送"这个 JD 有没有坑" → `analyze_jd_risks` 被调用 → 返回风险检测报告
- [x] 6.3 发送"'亲自带'是什么意思" → `decode_black_market_terms` 被调用 → 返回解码结果
- [x] 6.4 现有 20 个工具和 5 个子 agent 回归正常
