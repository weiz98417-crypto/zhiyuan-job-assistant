# Spec 40 第二批实现与验收进度

日期：2026-10-14。基线：`4ffdd91b0ea981fec058729f9134a6fa99aa4558`。在当前 `master` 继续实施，应用版本保持 `0.13.2`；本批未推送、部署或处理生产数据。

本批补齐 B0/B1 已实施切片的恢复、真实数据库及审查回归。67 个问题继续保持开放，完整 392 项外部验收仍未完成；不能将单元、服务、PostgreSQL fixture 或两个浏览器切片折算成全量通过。

## 本批行为

| 包 / 问题 | 实现与独立核验 | 仍待验收 |
| --- | --- | --- |
| W01 / ISS-048 | 设置页隔离目录只显示元数据；旧 CV 与当前账号云端版本/hash 完全匹配才核验恢复；签名凭据限时、账号与云端状态再次验证；避免覆盖新草稿；恢复与撤销均读回，原隔离资料保留 | 其他未同步资料和旧 IndexedDB 人工恢复；多 tab、设备及所有业务资料隔离参数 |
| W02 / ISS-042、056、065 | 只读 Offer 事实具有专用完成条件与来源证据；图片用途和短答绑定原材料；Worker 消费中断后不重复转录，完成重放只生成一次；任务纠正与 fenced checkpoint 在同一事务更新 Run binding | 真实图片供应商、SessionMemory adapter、全部故障矩阵、原生产会话与真实模型 |
| W02 / ADR-0029 | 旧 Run inspect 只读，按复核 hash 和锁行原 ID 就地迁移；非终态安全暂停并推进 fence；原材料和历史声明保留，旧输入不自动重跑；终态保持历史状态 | 生产只读影响清单、完整批量入口、可逆迁移包及 B0 回滚演练 |
| W03 / ISS-001 | 只问问题偏好持续生效；补充材料验 owner/hash 且不升格成本人事实；精确确认换绑和联合材料核验；新场归档旧场，污染遗留记录复核；冻结配置进入真实出题/评分请求 | Browser-Live、真实模型题目与评分质量、完整面试参数和历史用户处理 |
| W05 / 简历真源 | sections 规范化序列化供写者与面试读者共用；合法键序变更保持 hash，正文与额外字段变化仍拒绝；真实 JSONB 验证 | 任意历史 raw hash 原键序无法仅从 JSONB 恢复，需独立来源复核；其余 W05 写入和版本修复 |
| W06 / ISS-050 | 移除定位浏览器直写；Worker governed 确认基于持久用户原文、已展示结果和完整来源；profile 与 signal 独立读回；重置场次和事实门审查返工 | 真实模型/浏览器、强并发去重、跨 profile/signal 事务及完整混合任务 |

各专项证据：[账号与旧缓存](spec40-owner-followup-2026-10-13.md)、[Runtime](spec40-runtime-followup-2026-10-13.md)、[面试](spec40-interview-followup-2026-10-13.md)、[定位](spec40-positioning-followup-2026-10-13.md)。

## 首次失败与修复

首次完整 suite 为 1 failed / 1701 passed / 11 skipped：过宽的只读事实路由跳过了原有模型澄清路径。保持原回归断言，收窄到明确 Offer 或已确认的 Offer 附件，不以修改断言制造通过。

双轴审查进一步发现 Offer 美元币种、假设/撤回/示例被投影成事实、定位重置后复用旧答案和合法 CV 键序误拒。均要求先保留失败用例再修复。撤销存储删除无效果、旧 Run 缺独立读回也纳入本批审查。

## 最终统一验证

| 检查 | 实际结果与范围 |
| --- | --- |
| 完整 Vitest suite | exit 0；310 文件全部通过，1743 passed / 2 skipped / 0 failed。配置了三组隔离 PostgreSQL URL；1743 项包含 Runtime 7、面试 5、定位 1 共 13 项真实 PostgreSQL 回归，不另行累加。两个跳过分支仍未验收。 |
| 真实 Chromium 切片 | 当前账号 A→B→A 和旧 CV 恢复→刷新→撤销共 2 passed；独立 fixture、真实登录和服务端读回。不能覆盖全部账号资料、多 tab、设备或 392 项。 |
| TypeScript | Web 构建后 `npx tsc --noEmit --pretty false`，exit 0。 |
| Web / Worker 构建 | `npm run build:production`，exit 0；Web 与 Worker 编译通过。构建保留 tracing 等 warning，仅验证编译，不作为正式不可变发布包或 canary 放行证据。 |
| 本批源文件与配置 ESLint | exit 0；0 errors / 83 warnings，未将这些 warning 全部归为既有。 |
| diff 检查 | `git diff --check`，exit 0。 |
| 双轴审查 | 当前切片无开放阻断；完整 Spec 仍有明确实施和外部验收缺口，详见 [第二批审查](../review/spec40-second-implementation-review-2026-10-14.md)。 |

本机原始日志和浏览器证据保留在 `.private/spec40/` 与 `.e2e/spec40/`，不随提交发布。原失败记录继续保留，不以最终重跑覆盖。上述测试数量不是 392 项验收清单的完成数量；67 项问题保持开放。

## 发布状态

B0/B1 未放行。后续 W02 其余合同与多 Agent 交接、W04/W05/W07/W08/W09/W10/W11/W13、历史处理和正式发布门禁仍待完成。适用的 392 项、P0、迁移/回滚与版本化质量门全部满足后，才进入 B5 的生产切换；当前不会发布候选代码到线上。
