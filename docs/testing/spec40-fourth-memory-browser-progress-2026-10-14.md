# Spec 40 第四批记忆页面浏览器闭环

日期：2026-10-14。源码固定基线 `1c055bd77bab7c6ae5ea5c1bd1cc75c79fa7ee66` 加本批工作区差异。执行使用已通过 Web production build 的冻结复制，在独立目录运行 `next start`；不是开发服务器。专用 PostgreSQL 为 `127.0.0.1:55440/spec40_memory_browser`，专用 Redis 为 `127.0.0.1:56340/0`。账号和素材全部合成，未连接生产。

## 结果与适用范围

真实 Chromium 153：三项通过，零失败、重试、跳过，11.59 秒，含启动 2.37 秒。两项为真实浏览器、登录、API、PostgreSQL 写入和独立查询；第三项标为 BROWSER-MOCK，只拦截浏览器 `GET /api/memory/candidates` 返回 503，移除后重试真实服务得到 200。无 Worker、抽取模型或第三方模型调用。

| 补充回归 | 实际断言 |
| --- | --- |
| 敏感事实纠正 | core 原事实→实际 422；取消后全快照不变；同 payload 加用途确认后 private 替代、薪资谓词、正文/object/source 精确一致；旧事实失效；其余事实、候选、设置、ACL 不变；刷新可见正确来源；精确重放全快照不变 |
| 薪资候选确认 | 取消没有 PATCH、全快照不变；同意后 private/confirmed；原 quote/metadata 保留，owner/source/fact/purpose 审计精确匹配；其他事实/候选不变；刷新后正确正文与来源；重放全快照不变 |
| 不可用与恢复 | 503 显示未知数量、不显示零；发现设置禁用且写操作隐藏；无业务写入且全快照不变；移除拦截后真实 200 恢复精确 2 候选/7 事实、正文/来源/分区及可用纠正入口，快照仍不变 |

独立快照包含事实、决策、episode、候选、发现设置、chunks、entities、profile、分区 ACL、擦除请求/抑制及 entity/profile 关联表，使用另一个 PG client 查询，不复用前端 state 或 API 回包。seed 与测试开始前分别验证原始来源 hash、owner、ID 映射和创建时间。所有 oracle 使用排他写入。

关联 PG-MEM-001/003 参数子集及纠正扩展回归。固定 fixture clock 为 `2026-10-12T02:00:00Z`、条目创建时间 `2026-10-11T01:00:00Z`；运行时明确使用真实时钟，时区 Asia/Shanghai，候选到期 `2026-11-11T02:00:00Z`，过期后拒绝 seed，需新增 fixture 版本。这些记录不覆盖到期边界、全部跨账号参数、真实检索/Worker/模型与擦除流程，因此不关闭完整 case 或 W07，不计为 392 项全量通过。

## 冻结身份与证据

| 字段 | 值 |
| --- | --- |
| Evidence ID | `20261014-memory-fourth-final04` |
| Runner run ID | `01a13a00-011b-7b26-8d1e-f1e4c520ce7e` |
| Fixture ID/version | `aa913a4557967f9e` / `spec40-memory-browser-v2` |
| Build ID | `TnJEK0hjq7LveEH_Qe8ah` |
| Source SHA-256 | `4e65d17e17b5069ae548bd625e9bf8aefdd32b84a7919ad4c4c3f6a7a1b22f73` |
| Build SHA-256 | `69e6817239f462c5489213a5072314034636fc70e1363138e5b34baeda62c8db` |
| Fixture manifest SHA-256 | `aae5324b20639071f1c3ba4d90842e8aa696cb30abc219e7f35f8175a447a993` |
| Report SHA-256 | `4760abf1ab7e5016f9e7164e9aedd131c1aa4a0af9e58b3bca05165085e62fff` |

source digest 覆盖冻结 `src`，不含测试；build digest 覆盖 `.next/server`、`.next/static`、BUILD_ID、全部 `.next` 根文件及 next.config/package/postcss 配置。复制前后 hash 相等，launcher 启动前重算；配置强制显式 fixture ID，将 manifest SHA 传给 launcher，测试再核对 runtime identity/source/build/manifest，避免可变 pointer 切换数据。

证据目录（被忽略，保留于本机）：

- `.e2e/spec40-fourth-memory/20261014-memory-fourth-final04/`：report、summary、JUnit、三条 trace。
- `.e2e/spec40-fourth-memory/oracles/20261014-memory-fourth-final04/`：metadata、verified-runtime、前后独立跨表快照、503 注入记录。
- `.private/spec40/fourth-browser-final04.log`：最终 runner 日志；`fourth-browser-types03.log` 和 `fourth-browser-final-lint03.log`：最后类型与 lint。
- `.private/spec40/memory-browser/`：私有合成账号/manifest/runtime、app 与构建日志；其中凭据不提交。

## 首失败与修复后的重跑

产品首失败已保留在账本、薪资、总进度专项。以下属于本轮隔离环境或测试 harness 故障，不标为新增线上产品失败：

1. `20261014-memory-fourth-final01` 三项登录受生产 origin 门拒绝，实际 503 `ORIGIN_MISCONFIGURED`。补齐隔离 `APP_ORIGIN`、CSRF 和专用真实 Redis，保持生产安全门；未绕鉴权。
2. `20261014-memory-fourth-final02` 在 collection 阶段过早读取尚未启动的 runtime manifest，零测试执行。把 runtime 核对移动到真实 login 前，原日志和预留 ID 保留。
3. `20261014-memory-fourth-final03` 候选通过，其他两项 locator 匹配页面短暂并存的 status 或 Next 的空 alert。按实际业务文本收窄定位；该轮已经写入的合成用户保留，重新 seed 新用户/manifest，再使用 final04。
4. 隔离 nested build 的 Turbopack 中文 code-frame Rust panic、webpack 下既有可选 Route Handler 类型差异各有原日志；使用已经通过全部构建/类型门的冻结生产构建复制，不改无关源码、不跳类型门。

每次执行显式唯一 Evidence ID，runner 清理前原子预留，重用旧 ID 被拒；不覆盖首失败报告或 oracle。来源文本发生变化必须新增 fixture 版本，测试改变后用新 Evidence ID。

## 复现

前提：项目既有 E2E 初始化依赖已安装；本机隔离 PostgreSQL/pgvector 与 Redis 已启动。设置 `SPEC40_MEMORY_BROWSER_DATABASE_URL` 为专用本机库、`SPEC40_MEMORY_BROWSER_REDIS_URL` 为上述专用 Redis，然后运行 `node scripts/seed-spec40-memory-browser-fixture.mjs`。可使用 `SPEC40_MEMORY_BROWSER_FROZEN_BUILD_MANIFEST` 指向已独立验证的 root production build manifest，复制前源码、配置与产物 hash 必须匹配。

将 seed 输出的 identity 设置为 `SPEC40_MEMORY_BROWSER_FIXTURE_ID`，另设全新 `SPEC40_MEMORY_BROWSER_EVIDENCE_ID`，运行 `npx e2e run --config e2e.spec40-memory.config.ts`。不要用即将执行的同一 Evidence ID 先运行 collection/list，也不要对已经产生写入的 fixture 复跑基线用例。
