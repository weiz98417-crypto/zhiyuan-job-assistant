## 1. 管道端点

- [x] 1.1 新建 `frontend/src/app/api/agent/evaluate-pipeline/route.ts`
- [x] 1.2 顺序执行：fetch JD(如需) → scan-risks → evaluate → persist
- [x] 1.3 流式返回中间状态（risk_progress → eval_progress → done）

## 2. 工具更新

- [x] 2.1 修改 `evaluate-jd-full.ts`：调新端点而非分别调 3 个 API

## 3. 验证

- [x] 3.1 粘贴 JD 文本 → 一键返回风险报告 + A-G 评分 + 入库确认
- [x] 3.2 粘贴 JD URL → 自动抓取后同流程
