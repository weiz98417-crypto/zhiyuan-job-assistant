# Spec 40 第四批记忆账本切片

日期：2026-10-14。基线：`1c055bd`。仅本机隔离 PostgreSQL `127.0.0.1:55440/spec40_memory`，未操作 inventory 库或生产。此记录是 W07 的服务端业务实体 seam 验证，不代表 W07、B0/B1/B2、67 项问题或 392 项验收完成。

## 已实现

- 已有事实确认与纠正的共同 UPDATE 原先含五个占位参数、只有四个绑定参数，真实服务抛出 `08P01`。补齐失效原因，保持旧事实、取代关系、新事实、来源 episode、决策和 chunk 原子提交。
- 纠正重放只复用同 owner、同目标、当前取代事实、完整来源正文、替代正文和 object 匹配的已提交决策。不同来源、不同 object、陈旧目标、后续又被修订或跨 owner 请求拒绝；并发相同请求只创建一条替代事实。
- 即时 `admitMemory` 的 sequential/concurrent 同 source 请求在 `recordFact` 的 episode 行锁与事务中复用同一决策。重放前仍验证当前读取/写入门禁及 ACL；来源复用但 partition、predicate 或 object 改变，或原事实已被新来源替代时拒绝，不新建 NOOP、不覆盖新版本。
- 读取不再插入默认 ACL。缺失分区、完全未配置或缺表的 principal 权限查询均关闭；静态权限纯函数不再成为实际数据库读取的兜底授权。升级历史权限仍需独立迁移和审批，不能读时补齐。
- 当前偏好跨分区替代同时验证旧目标分区的写权限。同文不同分区不返回 NOOP；用户新近明确确认敏感用途后，已有 core 薪资可经授权 UPDATE 转为 private。
- `searchFactsHybrid.queryEmbedding` 接受 `number[] | null`。同一 governed SQL 在向量、词法、实体和中文薪资结构化召回之前执行 owner、实际 partition、source allowlist、活跃状态和清除抑制；缺少可归属 episode 或空来源标识不进入召回。显式空来源列表表示不允许任何来源。
- 无向量时保留词法/实体及薪资谓词或结构化字段匹配。“你还记得我的薪资底线吗”能召回“我不接受低于3万的岗位”，同时过滤旧事实、被擦除事实、不同来源、其他分区及其他 owner。
- 画像的全部绑定事实必须仍属本人、private 且 active；任一事实被纠正或失效后不再展示含旧值的整块画像。
- 画像所有事实依赖逐项验证 owner episode、非空来源和显式 source allowlist；block 自称来源可信不能提升未知来源事实。画像与 provenance 复用共享 `erasure-sql.ts` 的 hash、source/target 和 fact ID 抑制；空 scope 仍不能漏过 content 或 source-target 擦除。共享 SQL trim 字符集合遵守 JS trim，tab、换行和 NBSP 分别验证 content 与 source-target 两条路径。
- 来源/目标 hash 的小写规范化显式采用 `und-x-icu`，避免数据库默认 locale 与 JavaScript 在 `İ` 和 `ΟΣ` 上产生不同键。两条真实 PostgreSQL 回归分别验证检索、provenance 与画像不再返回已抑制事实。此 collation 的可用性与固定 Unicode 行为进入记忆发布检查器；缺失时不能打开受管读取门禁。

## 真实 RED 与独立读回

测试文件：`src/__tests__/spec40-memory-ledger.postgres.test.ts`。公开服务覆盖 `admitMemory → resolveMemoryCandidate`、`correctMemoryFact`、`recordFact`、混合检索和画像读取。独立 PG 连接读回 facts、episodes、decisions、chunks、candidate、entities、profile、ACL 及关联表；校验重放和拒绝不产生业务变化。

在合成内容专用 chunk INSERT trigger 注入错误，候选确认与纠正均在旧事实已尝试失效、实体已尝试写入后失败。完整跨表快照保持不变，候选仍 pending、旧事实仍 active；故障仅影响固定合成文本，未关闭全库门禁。

首失败日志保留在忽略目录 `.private/spec40/`：

| 日志 | 独立发现 |
| --- | --- |
| `memory-ledger-actual-first-red.log` | 两类公开写入实际 `08P01` |
| `memory-ledger-binding-green-replay-red.log` | SQL 修复后纠正重放仍因 inactive 拒绝 |
| `memory-ledger-acl-first-red.log` | 读取默认 INSERT 和显式缺分区扩权 |
| `memory-ledger-empty-acl-red.log` | 零 ACL 行仍回退默认授权 |
| `memory-ledger-nullable-first-red.log` | null embedding 无法词法降级 |
| `memory-ledger-profile-first-red.log` | 画像部分事实失效但旧 value 仍显示 |
| `memory-ledger-target-acl-first-red.log` | 偏好更新可使只读分区事实失效 |
| `memory-ledger-missing-source-first-red.log` | 未知来源旧事实仍可被结构召回 |
| `memory-salary-legacy-current-red.log` | 同文 core 薪资因 NOOP 未迁至 private；独立 admission 切片提供 |
| `memory-ledger-direct-first-red.log` | 即时写入重复生成 NOOP 决策、并发重放和来源复用/陈旧覆盖 |
| `memory-ledger-profile-policy-trim-first-red.log` | 画像 source allowlist/空 scope 擦除，以及 SQL 与 JS trim 不一致 |
| `memory-ledger-natural-salary-first-red.log` | generic predicate 的“我期望30K”无法通过薪资询问召回 |
| `memory-ledger-provenance-first-red.log` | hash/source-target 抑制后 provenance 仍能返回内容 |
| `memory-ledger-unicode-lower-first-red.log` | 默认 PostgreSQL lower 与 JavaScript 对 `İ`/`ΟΣ` 生成不同来源/目标键 |

前三个命名为 first/service red 的启动记录曾因绝对路径落点不一致而未找到测试，不作为产品首败证据；真实首败以 `memory-ledger-actual-first-red.log` 为准，未覆盖原始日志。

最新冻结文件包含 33 条真实 PostgreSQL 回归，已在根代理全量 suite 全部通过；独立 Spec 复验新增两条 Unicode 回归通过。既有 `fact-ledger.test.ts` 已去除源码必须重复六次的计数断言，改为共享 helper 的 qualified alias 契约，12 项通过。同文 core→private、即时与纠正的精确重放均已通过。合并批次的最终类型、构建、浏览器与统一测试结果见第四批总进度，不以这里数量代替完整验收。

## 尚未完成

本切片不包含真实浏览器刷新/会话复原、全部 `AC-MEM-001..009` 参数、392 全量账本、真实模型质量、所有旧来源的可信准入及只读影响清单、历史 ACL 迁移、跨存储定向擦除与恢复重放、完整故障竞态矩阵。Root 另负责敏感纠正用途门禁、HTTP/UI 入口及整体检索在晚到抑制/失效时的复核；本文件不替代其证据。没有迁移或删除真实用户历史，没有发布。
