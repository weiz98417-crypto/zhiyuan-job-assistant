## 1. API 端点

- [x] 1.1 新建 `frontend/src/app/api/agent/mode/[mode]/route.ts` — 动态路由读 `modes/zh/{mode}.md`

## 2. check_pipeline_health 工具

- [x] 2.1 新建 `frontend/src/lib/agent/tools/query/check-pipeline-health.ts`
- [x] 2.2 实现 handler：从 DexieDB `applications` 表计算逾期天数（>7 天标记逾期）
- [x] 2.3 实现 formatResult：逾期表格（公司/岗位/日期/天数/建议）+ 健康状态总结

## 3. self_positioning 工具

- [x] 3.1 新建 `frontend/src/lib/agent/tools/action/self-positioning.ts`
- [x] 3.2 实现 handler：GET `/api/agent/mode/dingwei` → 返回框架文本
- [x] 3.3 实现 formatResult：截取 4 阶段要点 + 完整框架在 data 中

## 4. prepare_interview_full 工具

- [x] 4.1 新建 `frontend/src/lib/agent/tools/action/prepare-interview-full.ts`
- [x] 4.2 实现 handler：加载 interview-prep.md + story-bank.md
- [x] 4.3 实现 formatResult：结构化面试方案（分面的题目/谈判/反问）

## 5. 注册

- [x] 5.1 修改 `frontend/src/lib/agent/tools/index.ts`——import + register 3 条

## 6. 验证

- [x] 6.1 发送"我投了哪些还没回复" → `check_pipeline_health` 被调用 → 逾期列表
- [x] 6.2 发送"帮我找个方向" → `self_positioning` 被调用 → dingwei 4 阶段引导
- [x] 6.3 发送"面字节 AI PM 准备什么" → `prepare_interview_full` 被调用 → 定制方案
- [x] 6.4 现有工具无回归
