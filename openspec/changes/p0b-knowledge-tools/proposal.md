## Why

P0A 让 Agent 能干活（评估 JD、检测风险）。但 Agent 仍然"被动"——用户不主动问，Agent 不会主动告知管道逾期、不会引导职业方向探索、面试准备只出几道通题而非定制方案。P0B 注册 3 个工具让 Agent 从被动应答变为主动帮助：管道健康检查、dingwei 自我定位引导、面试全案准备。

## What Changes

- 新建 `check_pipeline_health` 工具：检测投递管道中的逾期项（超过 N 天未回复），返回逾期列表
- 新建 `self_positioning` 工具：加载 `modes/zh/dingwei.md` 的 4 阶段对话引导系统（兴趣探索→能力盘点→限幅信念检测→方向收敛）
- 新建 `prepare_interview_full` 工具：加载 `modes/zh/interview-prep.md` + `interview-prep/story-bank.md`，返回定制化面试方案（技术/行为/HR/群面题 + 薪资谈判策略 + 反问建议）
- 新建支撑 API 端点：`/api/agent/mode/[mode]`（读取指定 mode 文件内容）
- 修改 `tools/index.ts`：注册 3 个新工具

## Capabilities

### New Capabilities

- `pipeline-health-check`: 管道逾期检测——查询投递记录，识别超过 N 天无回复的项，按紧急性排序输出
- `self-positioning`: 自我定位对话引导——加载 dingwei.md 的 4 阶段框架，引导用户从兴趣→能力→信念→方向逐步探索职业方向
- `interview-full-prep`: 完整面试方案生成——根据目标公司和岗位，加载面试准备模式 + STAR 故事库，输出 4 类面试题目 + 薪资谈判策略

## Impact

- **新建**: `frontend/src/lib/agent/tools/query/check-pipeline-health.ts`
- **新建**: `frontend/src/lib/agent/tools/action/self-positioning.ts`
- **新建**: `frontend/src/lib/agent/tools/action/prepare-interview-full.ts`
- **新建**: `frontend/src/app/api/agent/mode/[mode]/route.ts`
- **修改**: `frontend/src/lib/agent/tools/index.ts`
- **依赖**: `native-function-calling`（change 1）
