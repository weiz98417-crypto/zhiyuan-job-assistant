## 1. compare_offers_deep 工具

- [x] 1.1 新建 `frontend/src/lib/agent/tools/action/compare-offers-deep.ts`
- [x] 1.2 实现 handler：接收 offers 数组 → 加载 ofertas.md 对比框架 → 计算 6 维加权分 → 税后实得 → 输出推荐
- [x] 1.3 实现 formatResult：6 维对比表 + 推荐总结 + 谈判策略

## 2. get_profile_insights 工具

- [x] 2.1 新建 `frontend/src/lib/agent/tools/query/get-profile-insights.ts`
- [x] 2.2 实现 handler：读 SQLite profile_signals + session_memory → 提炼洞察
- [x] 2.3 实现 formatResult：画像摘要（行业偏好/薪资区间/岗位类型/行为模式）

## 3. detect_skill_gaps 工具

- [x] 3.1 新建 `frontend/src/lib/agent/tools/query/detect-skill-gaps.ts`
- [x] 3.2 实现 handler：对比 CV 技能 vs JD 要求 → 输出缺口列表
- [x] 3.3 实现 formatResult：缺口表格（技能名/优先级/学习建议）

## 4. 注册

- [x] 4.1 修改 `frontend/src/lib/agent/tools/index.ts`——import + register 3 条

## 5. 验证

- [x] 5.1 发送"帮我对比字节和美团这两个 offer" → `compare_offers_deep` 被调用 → 6 维对比 + 推荐
- [x] 5.2 发送"我有什么求职偏好" → `get_profile_insights` 被调用 → 画像洞察
- [x] 5.3 发送"我还缺什么技能才能投这个 JD" → `detect_skill_gaps` 被调用 → 缺口列表
- [x] 5.4 全部现有工具无回归
