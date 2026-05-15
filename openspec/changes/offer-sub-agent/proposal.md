## Why

用户评估 Offer 时被错误路由到 JD 评估 agent，走 A-G 框架而非 Offer 评估框架。需要独立 Offer 评估子 agent。

## What Changes

- 新建 offer-agent (`priority: 11`，高于 evaluate 的 `10`)
- 专用工具: `evaluate_offer`(单个) + `compare_offers_deep`(对比)
- `evaluate_offer` 改为 LLM 框架驱动（不再调 JD API）
- `compare_offers_deep` 新增 SQLite 持久化
- Compare 页新增 SQLite API 数据源

## Impact

- `src/lib/agent/registry/agents/offer-agent.ts` (NEW)
- `src/lib/agent/registry/agents/offer/agent.md` (NEW)
- `src/lib/agent/registry/index.ts` (注册)
- `src/lib/agent/tools/action/evaluate-offer.ts` (修复)
- `src/lib/agent/tools/action/compare-offers-deep.ts` (持久化)
- `src/app/compare/page.tsx` (双数据源)
