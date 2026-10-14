# Spec40 面试第二批实现与验证记录

日期：2026-10-13。基线：`4ffdd91`。工作包：W03 / ISS-001 的服务与 Worker 接缝增量。未提交、未部署；线上发布仍受 B5 门禁约束。

## 已完成的行为

| 对应规范 | 实际实现与断言 | 当前状态 |
| --- | --- | --- |
| AC-INT-009 | “只问问题”持久化为本场偏好；下一主问题、追问、恢复输出只包含当前问题，评分仍在状态中保留，材料绑定不变 | 服务、Worker 定向验证通过；浏览器待验收 |
| AC-INT-014 | 补充 JD / 第三方参考简历通过账号范围读回，保存来源、正文快照、hash、请求标识；进入出题和评分上下文，明确标成参考，不写入本人回答或替换正式绑定 | 服务验证通过；浏览器与真实模型待验收 |
| AC-INT-015～017 | 正式换绑先暂停，精确确认标识匹配后重新读回并校验目标；新场使用新 engine / snapshot ID，清零本场题目与回答，旧场完整归档，保留换绑历史 | 服务验证通过；浏览器待验收 |
| AC-INT-016～017 负向 | 无权限材料、歧义本人版本、确认前 JD / CV 内容变化被拒绝；联合 JD / CV 任一项未核验不得部分换绑；取消恢复原材料与原题 | 服务验证通过 |
| AC-INT-018 | 准备快照中的模式、难度、关注点与允许追问配置在刷新后真实进入题库检索、出题及 rubric 请求；pressure 映射 senior 召回，不改变事实与评分门禁 | 请求级断言与 PostgreSQL 迁移验证通过；真实模型质量待验收 |
| AC-INT-020、024 / 历史污染 | 遗留题目与回答保存在隔离原始状态；只展示有助手原始记录支持的复核项，明确确认后重新作答；旧评分不提升成新事实，污染错误题不成为当前题；从头恢复创建新场并归档旧证据 | 服务与真实 PostgreSQL 验证通过；浏览器待验收 |

## 红灯到绿灯证据

1. 冻结压力配置测试首先失败于题库查询缺失 `difficulty`，补齐模式、难度与上下文在题库和评分路径的消费后通过。
2. 联合 JD-B / CV-v2 负向测试首先发现 JD 无法核验时仍提示确认仅切换 CV；增加 JD 请求边界后，未解析 JD、歧义 CV、确认前 CV 改变三分支全部通过。
3. 真实 PostgreSQL 迁移测试发现历史隔离路径丢失冻结配置；保留模式、难度、关注点和追问设置后通过，同时将未经复核的旧错误题留在隔离原始状态。
4. 审查发现合法 `CVSection` 的对象键序经 JSONB 重排后会误拒 raw hash。新增真源投影测试与真实 PostgreSQL 用例先红灯，再统一 `canonicalResumeSectionsJson` 供 resume document 写者与面试读者使用后通过；规范化保留正文、全部字段及数组顺序，正文/额外字段变化仍改变 hash。既有标准导入 hash 保持兼容。

## 最后验证

- 最终 19 个面试与相邻简历真源测试文件：114 passed / 1 skipped。跳过的是既有真实模型校准分支，不能据此宣称真实模型验收完成。
- 新增 `src/__tests__/interview-postgres-checkpoint.integration.test.ts`：5 passed，使用实际 pg / repositories / JSONB，而不是 PostgreSQL query mock。
- `npx tsc --noEmit`：exit 0。
- `git diff --check`：exit 0。

PostgreSQL 命令（仅隔离 fixture 数据库）：

```powershell
$env:SPEC40_INTERVIEW_DATABASE_URL='postgresql://spec40_fixture@127.0.0.1:55440/spec40_interview'
npx vitest run src/__tests__/interview-postgres-checkpoint.integration.test.ts
```

真实 PostgreSQL 断言涵盖：两个并发同版本写入仅一个 CAS 胜出、旧版本/他人/无版本后台写入拒绝、独立 SQL 读回保留胜出问题与原 Worker 消息、暂停/刷新/恢复幂等、准备快照迁移、污染遗留记录隔离与确认重开、合法不同对象键序 CV 经真源投影与 JSONB 序列化后仍核验并完成换绑、正文篡改但保留旧 hash 时硬拒绝。测试只创建、清理随机前缀合成账号数据，显式限制目标为 localhost:55440/spec40_interview，不停止共享容器。

## 未关闭的验收

本轮使用真实仓储和服务，但模型提供者在允许的外部 seam 上被替换为固定 fixture；不能用请求包含配置代替真实模型题目针对性、压力模式行为及 rubric 质量验收。浏览器完整交互、真实 Worker 调度恢复、多设备与所有 AC-INT 分支仍需对应证据。AC-INT-019 题目相关性与类型覆盖、AC-INT-023 评分长期趋势等未在本增量扩展；ISS-001 和完整 392 项验收不据此关闭。历史真实用户记录仍按确认的数据处理规则执行，不自动处理。

无法从 JSONB 单独恢复任意旧 raw hash 的原对象键序。本轮没有重写历史 document；旧标准键序仍核验，其他历史 hash 无法确定对应正文时保持需复核，不通过忽略 hash 放行。若要兼容这类历史记录，需要独立 source artifact / integrity 证据和符合历史数据确认规则的可逆处理。
