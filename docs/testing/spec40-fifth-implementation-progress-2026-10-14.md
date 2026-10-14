# Spec 40 第五批记忆列表读取保护

日期：2026-10-14。固定基线 `43ab742b65a6f5fee8ac1b1c5bf4849be6507200`。在第四批已验收切片上继续处理 W07 的管理列表与来源历史；生产仍为 0.13.2，未推送、部署或修改真实历史数据。

## 实际行为

`listActiveMemoryFacts`（`GET /api/memory/candidates` 的页面事实集合）和 `listFactsByEpisode` 统一使用完整 content hash、来源/目标键、factIds 擦除抑制。事实必须关联同 owner 的 episode，source type/ID 使用完整 JavaScript trim 字符集判断非空；无来源、异主来源或仅包含 tab/newline/NBSP 等空白的旧记录停止展示，原记录保留。候选确认、纠正、原精确回执和写事务不变。

历史入口仍返回合法未被擦除的失效事实与替代关系，没有把历史列表改成仅 active。撤去读 ACL 后，两列表均不可读取。episode 历史、provenance 的 entityKeys 和 hybrid 检索的实体排名只消费同 owner、同分区关联，错误 core→private 关联不会泄露私人名称或影响 core 事实排名。

## 首失败与验证

- `.private/spec40/fifth-memory-list-first-red.log`：两个真实 PostgreSQL 反例显示，scope 为空但 content/source-target suppression 有效的事实仍出现在管理列表；修复后 `fifth-memory-list-green.log` 通过。
- `.private/spec40/fifth-source-entity-first-red.log`：两个全空白来源反例仍被展示；同 owner 的跨分区实体名称进入历史输出。共享 trim 与同分区关联修复后，三个公开读取结果和存储不变断言通过。
- 最终真实账本数据库文件 **39 项通过**（第四批 33，加本批 6），日志 `fifth-source-entity-ledger-final.log`。额外反例核查 foreign/orphan episode、失效历史保留和 ACL 撤权。
- 冻结源码全 suite：**320 文件，1986 项通过，2 项跳过**；六组本机真实 PG fixture 实际启用，文件串行，日志 `fifth-fullsuite-frozen-final02.log`。不折算为 392 外部验收。
- Web/Worker production build、构建后类型检查、定向 ESLint 和知识 drift 通过。日志 `fifth-frozen-build02.log`、`fifth-frozen-worker-build.log`、`fifth-frozen-types.log`、`fifth-frozen-lint02.log`、`fifth-knowledge-drift.log`。Worker SHA-256：`305c816969522216818b12aa65413b9cf4b92c2c7bcc2b67330fdadeba8d5ae7`。

有界环境失败保留：`fifth-source-entity-green.log` 的 Vitest 子进程异常退出（无测试完成），随后同文件真实 39 项通过；早期 `fifth-fullsuite-final-2026-10-14.log` 少配置定位 fixture，319 文件/1982 通过、1 文件/3 项跳过，且生产源码随后变化，因此不作为最终结果。最终全 suite 使用正确 `POSITIONING_POSTGRES_TEST_URL` 后六组 fixture 均启用。

## 真实 Chromium

最新 production `next start` 四条全部通过，零重试/失败/跳过，16.62 秒（启动 2.92 秒）。第四批三条取消/敏感确认/错误恢复在新构建上重跑；新增第四条 FAULT 仅在隔离 PG 构造 content/source-target suppression 与错误 foreign episode，实际浏览器刷新和真实鉴权 GET 返回精确 4 个允许事实、2 个候选，其余来源正确，注入后的完整跨表快照保持不变。

这条 FAULT 证明读取抑制与错源过滤，不证明物理擦除或擦除流程完成。第三条仍仅浏览器 mock 一个 GET 的 503；其后移除拦截，使用真实 200 恢复。全部无模型、Worker。fixture 是 v3、固定合成时间/显式真实运行时 clock，每条来源 hash 独立验证。

| 冻结字段 | 值 |
| --- | --- |
| Evidence ID / run ID | `20261014-memory-fifth-final01` / `01a13a0f-1293-7113-9ca0-fbf52be9e7e1` |
| Fixture ID / version | `c28926c35f97e886` / `spec40-memory-browser-v3` |
| Build ID | `u-ueC7_Ijl60oXWlAPf1G` |
| Source SHA-256 | `c190231ae696634336b1139c92fda35cc482a17ca67c2f5a1ee78393372158b1` |
| Build SHA-256 | `ea64ba4c8de348c67d57d1e7cd5ec4b7f323b864cc4af65b6842f8038c381c27` |
| Manifest SHA-256 | `2db40f34c109c1f316c9ac9bcf320d6bbb8d4a45562d3c6b31555a04803843b0` |
| Report SHA-256 | `82796dc32d3a2fea9f20fddd8ad010293b7c590d3c63c060ecc239c55a04d180` |

原始 report/trace 在 `.e2e/spec40-fourth-memory/20261014-memory-fifth-final01/`，oracle 在同根 `oracles/20261014-memory-fifth-final01/`，runtime/私有 fixture 在 `.private/spec40/memory-browser/`，均保留于本机且忽略提交。早期未完成审查的 v3 构建/fixture 保留，最终重新 build、capture manifest、seed 新账号后执行，未用旧产物冒充当前源码。

## 审查与后续

Standards 与 Spec 分轴复审发现空白来源验证漂移、跨分区 entityKeys/排名缺口，返工后两轴本切片阻断项均 0，见 [第五批审查](../review/spec40-fifth-implementation-review-2026-10-14.md)。

完整 W07 仍 partial：`listOpenFacts` 同时参与写决策，不能简单隐藏仍开放的抑制事实后误 ADD；需分离内部冲突处理，并验证明确重新记住与抑制解除的事务/竞态。实体摘要重建、擦除后的全实体重建、其他来源规范化接口仍待统一。实际 Worker/模型、历史可信迁移、全层擦除/恢复重放、完整故障矩阵与 392 项发布门仍未全部完成。本批未把 unknown source category 一律禁读，保持现有 category/filter 语义，真实历史处理继续先只读盘点。
