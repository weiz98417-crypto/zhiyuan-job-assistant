# Spec 40 首批实现与验收进度

日期：2026-10-13。实施前基线：`01e46a6d35fea51aaeddcc84f7860c56606c04de`。本批在当前 `master` 实施；应用版本仍为 `0.13.2`，尚未发布或部署。

本批是 B0/B1 的安全和上下文实现，以及并行完成的 Offer 数据模型切片。67 项问题尚未全部修复；全部问题仍开放，不能以以下单元、组件或服务测试关闭线上问题。392 项新的外部验收均未执行；原审计的 pass 0 / fail 117 / partial 229 / blocked 44 / not_run 2 保持不变。

## 本批实现

| 工作包 / 问题 | 已实现行为 | 仍需验收或实现 |
| --- | --- | --- |
| W01 / ISS-048 | 验证 `/api/users/me` 后才挂载业务页；owner 分区的 IndexedDB/localStorage/sessionStorage；换号、共享账号变化、旧读写句柄、迟到响应正文与 SSE 块均拒绝；迟到身份 401 不注销新账号；CSRF 缓存按账号代际隔离；异步缓存写入捕获原账号数据库；推荐及服务端上下文缓存不跨账号复用 | 真实 Chromium A→B→A、多 tab、导出、长异步写入和刷新读回；仍需完整核查所有组合异步调用的 owner 传递 |
| W01 / 旧缓存 | 无 owner 的旧 storage 原值转入隔离键；旧 `zhiyuan` IndexedDB 原样保留，正常页面停止读取 | 人工恢复界面、可信 owner/hash 自动迁移、迁移 dry-run/回滚包尚未完成；不得自动归给登录账号 |
| W01 / ISS-021 | 匿名密码找回使用与 middleware 相同的 Origin 保护，不先请求登录 CSRF | 真实浏览器、账号存在/不存在、限流等完整参数验收 |
| W01 / ISS-033/046/047 | 导入回执区分新增/重复/非法、缺表头和不支持格式，非法状态/编号不补默认；事务中后续写入失败全量回滚；薪资负值/倒置不持久化；本地清除事务枚举 12 表并读回归零，仅清当前 owner 键 | 浏览器导入/清理错误分支与服务器数据不变读回；设置表单完整可访问性属后续 W11 |
| W02 / ISS-042 | 持久 pending 输入按 runId/inputId 去重，checkpoint 与转录保留稳定身份；消费失败后恢复不重复追加纠正 | 原 pending311 对应真实 PostgreSQL、Worker lease/故障恢复、连续纠正及正式 CV 不变证据 |
| W02 / ISS-065 | 禁止写入约束从 envelope、admission、有效合同持续到 tool governance，Worker 重启不丢失 | “仅整理”派生目标的正确完成和撤回全链仍未闭环；不能把禁止写入后的合同失败伪改成成功 |
| W02 / ISS-056 | Worker 摄取图片材料与用途，checkpoint/转录持久化；短答继续绑定原材料；当前 OCR 的 JD 文本或简历图片进入实际工具请求；新图/第二张/读取失败/错 owner 或 Run 有回归 | 真实图片、供应商、浏览器刷新读回；目标纠正和完整参数矩阵；原生产会话复现 |
| W03 / ISS-001 | 面试启动统一 durable engine；控制输入与答案分开；追问各自绑定原答案；稳定纯投影、缺评分证据不假造 0 分；Worker 消费真实领域状态事件；repository checkpoint CAS 防竞争与伪凭据；面试服务停止写转录，旧直写 API 返回 422；准备快照身份优先，natural start 难度/focus 持久保存 | 完整外部面试、旧会话复核恢复、确认材料换绑、补充材料 ledger、持续格式偏好和实际出题评分定制；真实 PostgreSQL CAS 竞争及供应商评分；B1 不放行 |
| W06 / ISS-050 | 定位 fallback 只采用户自述，区分学习/否定/计划/示例/第三方；最新纠正优先；简短来源与展开 quote/turn ID；保存后独立读回证据，不追加无源餐饮行业 | 模型自由定位文本、`mine_profile` SOP 与真实 Worker 确认路径的统一事实门；历史数据扫描/人工处理；问题仍开放 |
| W12 / ISS-040/066 | 未知社保/公积金/试用期/奖金贯穿 parser、API、repository、报告和 UI，保留明确零/false；确定现金与非保证奖金分开，估算假设独立；部分编辑保留原条件；SQLite/Postgres nullable 迁移 | 隔离 PostgreSQL 迁移、真实模型/页面完整验收、历史受影响记录只读扫描；本批不改写历史真实用户数据 |

## 392 项验收清单

`scripts/build-e2e-remediation-manifest.mjs` 从两份规范和 67 行矩阵建立 392 个唯一 case、唯一主责包、来源行、oracle、fixture 版本、参数展开状态和 issue/story 关系。主题故事没有单列的矩阵要求带 `matrixOnlyReason`，不会强行关联无关故事。

可选 baseline 只导入历史状态，丢弃原始观察、凭据和用户材料。新执行全部初始为 `not_run`，第一结果、重试结果与证据独立。AC-RUN-016 / AC-EXT-010 显式要求隔离 FAULT；设备、API 与真实模型附加层单列。UNIT 证据不能满足浏览器证据要求。

生成本地清单：

```powershell
node scripts/build-e2e-remediation-manifest.mjs --baseline=.e2e/production/coverage-audit.json --output=.private/spec40/acceptance-manifest.json
```

没有原始审计文件也可省略 `--baseline` 生成；历史状态为 `unavailable`，不会冒充历史通过。

该脚本目前是清单脚手架，不是正式发布放行器。参数展开、fixture seed/hash、55 工具及动态 MCP coverage、code/model/prompt/tool/fixture/judge 身份验证、N/A 审批、跨批回滚和正式 gate 接入仍待实现。默认必然阻断，不能通过手填 `pass` 发布。

## 验证与审查

本批定向回归使用 Vitest 的 UNIT/SIM、组件 JSDOM、隔离 SQLite API/repository；它们不等于 BROWSER-MOCK、BROWSER-LIVE 或真实 PostgreSQL 验收。

- Runtime：11 文件 / 101 测试通过。
- 职业定位与来源 UI/API：4 文件 / 49 测试通过。
- 面试定向回归：14 文件 / 84 测试通过，1 个真实模型分支跳过；后续补充 checkpoint 回归 18/18 通过。
- 账号隔离、AuthGate、迟到响应、缓存、manifest 等组合：9 文件 / 34 测试通过。
- Offer 模型、迁移、读回和组件：4 文件 / 23 测试通过，另有既有服务回归。
- 定期 TypeScript 检查通过；定向 ESLint 无错误，存在既有 warning。
- 双轴审查发现的奖金/社保否定、定位示例纠正/“没学会”、跨账号上下文缓存、迟到身份 401 和面试冻结配置问题已先重现再修复；面试转录单写者已收口。

最终统一验证：

| 检查 | 实际结果 |
| --- | --- |
| `npm test -- --maxWorkers=2 --reporter=dot` | 300 文件全部通过；1666 passed / 2 skipped / 0 failed。两条需要环境配置的分支仍未验收，不折算通过。 |
| `npx tsc --noEmit --pretty false` | exit 0，最终 Web 构建后重跑通过。 |
| `npm run build:production` | exit 0；Next.js 16.4.0 Web 与 esbuild Worker 均通过。保留 middleware 弃用及动态文件 tracing 既有 warning。 |
| 定向 ESLint | exit 0，无错误；核心最后一组仅 1 个既有未使用 import warning，页面及领域旧 warning 另保留。 |
| `git diff --check` | exit 0。 |
| code-review Standards 轴 | 最终 0 未解决标准违例、0 待处理判断性 smell。 |
| code-review Spec 轴 | 未发现阻止本批代码提交的新错误；旧缓存恢复、面试格式/补充材料和完整外部验收保持 partial。 |

初次默认构建长时间停在 CSS 扫描；核查发现 `.e2e/production` 有 2564 个原始证据文件、约 258MB，被自动扫描纳入。已仅增加 Git 忽略规则，原证据文件完整保留。重新使用默认构建器后 16.1 秒编译成功。诊断期间替代 webpack 构建触发的旧可选 Route Handler 参数类型问题不作为本批最终构建结果，未修改这些无关路由。

原始验证日志在本机 `.private/spec40/`，不随提交发布。全部结果仍为本批 UNIT/SIM/组件/服务验收，没有新增真实 Chromium、真实模型或 PostgreSQL 完整闭环通过声明。

## 后续实施范围

W05 CV/版本/参考来源、W07 记忆召回/修订、W08 投递/提醒/Offer 对比入口、W09 统计/周报、W10 公司集合、W04/W11/W13 附件 UI/渲染/滚动/可访问性/媒体，以及 W02 其余合同/交接/委派均未完成。本批不覆盖剩余问题，不重写历史审计，不生成生产发布包。

按 Spec 40：只有 P0 全部关闭、迁移与独立读回齐全、392 项适用 case 完整执行通过且正式 release gate 通过后，才允许 B5 的一次生产切换。
