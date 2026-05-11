## Why

P0A/P0B 让 Agent 能干活和主动提醒。P2 让 Agent 能辅助高层次决策：两个 offer 选哪个、我的画像有什么洞察、我还缺什么技能。这些工具依赖已建好的资产（`modes/zh/ofertas.md` + RadarChart + salary_benchmarks + 63 条 profile_signals）和 `layered-memory` change 的语义提取。

## What Changes

- 新建 `compare_offers_deep` 工具：加载 ofertas.md 多维对比框架 + 薪资计算器公式，输出 6 维雷达图数据 + 加权推荐 + 谈判策略
- 新建 `get_profile_insights` 工具：从 63 条 profile_signals + 语义记忆中提炼画像洞察、模式识别
- 新建 `detect_skill_gaps` 工具：JD 高频要求 vs CV 已有技能 → 缺口分析
- 修改 `tools/index.ts`：注册 3 个新工具

## Capabilities

### New Capabilities

- `offer-deep-compare`: 多 offer 深度对比——接收 2+ 个 offer 数据，输出 6 维评分（薪资、职级、成长、稳定性、文化、地点）+ 税后实得计算 + 谈判建议
- `profile-insights`: 画像洞察——从历史 profile_signals 和语义记忆中提取用户行为模式、偏好趋势、隐性需求
- `skill-gap-detection`: 技能缺口检测——对比目标 JD 的技能要求与用户 CV 中的已有技能，输出缺失技能及优先级

## Impact

- **新建**: `frontend/src/lib/agent/tools/action/compare-offers-deep.ts`
- **新建**: `frontend/src/lib/agent/tools/query/get-profile-insights.ts`
- **新建**: `frontend/src/lib/agent/tools/query/detect-skill-gaps.ts`
- **修改**: `frontend/src/lib/agent/tools/index.ts`
- **依赖**: `layered-memory`（change 5），`get_profile_insights` 依赖语义记忆
