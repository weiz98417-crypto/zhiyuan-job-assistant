# Spec 16: Governed Browser Tool Via Playwright MCP

**Target label:** `ready-for-agent`  
**Depends on:** ADR-0008、ADR-0009、ADR-0039、MCPManager 接缝现状；批次归属 0.13.0（A2）

## Problem Statement

Playwright 已在依赖中但只服务于独立扫描进程与 e2e，agent 工具面没有浏览器工具——「打开这个招聘页看一眼再回答」做不到。MCP 的活跃集成是三枚手写 shim（`src/lib/agent/tools/index.ts:57-59`，治理元数据显式）；自动注册链路 `registerMCPTools`（`mcp/tools.ts:7-21`）零调用方、`/api/agent/mcp/call` 为 410 桩、`mcp.config.json` 无 args 字段且 connect 超时仅 8s——本 spec 的第一步是**复活**这条接缝，而不是插进一条活接缝。工具全部进程内执行，无隔离；生产不存在域名白名单。

## Solution

复活 MCP 注册链路（worker 启动序列接入 + 配置扩展 args + 启动健康断言），经 MCPManager 接缝引入 `@playwright/mcp`（headless、isolated 的 stdio 子进程，Apache-2.0）；建立显式治理元数据与**封闭**的读/写后果分级：导航/读取/抽取为读动作免审批，点击/填表/提交为写动作过 scoped Run Gate，未显式分级的一律按写处理；浏览器会话跨 Run 隔离并串行化；新建 repo 级域名允许清单约束导航范围，清单外确定性拒绝；为页面内容定义独立于 MCP 1000 字符截断的内容通路。

## User Stories

1. 作为求职者，我希望 agent 能打开我发给它的招聘页面并据实回答内容，而不要求我复制粘贴全文。
2. 作为求职者，我希望浏览器里的填表、点击、提交动作先经我批准，从而不会替我误投简历。
3. 作为求职者，我希望 agent 不会打开陌生网站，从而不担心钓鱼页或无关站点。
4. 作为运维人员，我希望浏览器运行在受控子进程且崩溃不拖垮 web 进程，从而风险可控。
5. 作为实现 Agent，我希望浏览器工具的治理元数据显式声明后果，从而 Run Gate 语义与其他工具一致。

## Implementation Decisions

- **复活注册链路**：`mcp.config.json` schema 扩展 `args` 数组与 `timeoutMs`；`registerMCPTools` 接入 worker 启动序列（明确注册时机与 registry seal 的先后）；启动健康断言——`npx -y` 冷启动超出 connect 超时必须显式告警并落结构化日志，不得静默不注册（那是本方案最忌讳的静默失败）。
- `@playwright/mcp` 以 `--headless --isolated` 启动；**会话隔离**：isolated 无持久 profile + worker 内浏览器工具串行锁——MCPManager 是进程级单例（manager.ts:179），worker `concurrency=2` 下不得共享页面状态，跨用户泄漏为硬失败。
- 显式治理元数据覆盖机制：浏览器工具必须显式声明 `governance.effect` 与 `risk`，按名字推导仅作 legacy 兜底。
- 封闭后果分级（ADR-0039）：navigate / read / extract = read-effect，免 Run Gate；click / type / submit = write-effect，`requiresUserConfirmation=true` → scoped Run Gate → RunGateCard；**未显式分级的浏览器工具默认按 write-effect 处理**；`browser_evaluate`（页面内任意 JS，等同远程执行）本批不注册。
- 域名允许清单：repo 内 TS 配置文件（改动走 PR 评审），初始条目为主流招聘站（BOSS 直聘、猎聘、拉勾、前程无忧、智联招聘等）；清单外导航直接拒绝，不产生审批卡。
- 内容通路：浏览器读工具的结果绕开 MCP `formatResult` 的 1000 字符截断（manager.ts:93-102），单独预算上限（目标 20k 字符）；页面文本进模型上下文按「Run Context」预算治理（第三方材料），进用户界面按「安全工具视图」投影（2026-10 决策 #16）。
- 生产前置：ECS chromium 就绪核验（`install:playwright`）、磁盘余量；worker `concurrency=2` 下的内存上限与超时护栏；浏览器会话崩溃不得影响同 worker 其他 Run；MCP server 连接失败保持 optional 语义但必须显式告警。

## Testing Decisions

- 治理分级单测：同一浏览器工具集内读动作直接执行、写动作必现 Gate；未分级工具默认按写；scopeHash 覆盖浏览器动作参数。
- 隔离单测：并发两个 Run 使用浏览器工具不共享页面状态（会话隔离 + 串行锁）。
- 域名清单单测：清单内导航放行；清单外确定性拒绝且无审批卡产生。
- e2e 冒烟：白名单内 JD 页打开 → 内容问答（页面文本超过 1000 字符仍可回答）；写动作 → RunGateCard 旅程 eval。
- 启动健康断言：配置缺失或冷启动超时产生显式告警日志而非静默跳过。
- 静态断言：本 spec 实现不复用、不修改 scan-worker。

## Out of Scope

- Stagehand 智能抽取（后续版本）；代码沙箱。
- 改变 scan-worker 行为（其 Postgres 封锁已在提交 50919be 修复）。
- 登录态与验证码处理（第一期只处理无需登录的页面）。

## Further Notes

- 页面内容双轨治理（2026-10 决策 #16）：进模型上下文按「Run Context」预算与第三方材料规则；进用户界面按「安全工具视图」投影——不得把整页原文灌入 Conversation Item。
- 本 spec 只新增工具与治理，不改变 Run Admission、Task Program 与事件方言。
- 30s callTool 超时与 30s read deadline 的双重超时（manager.ts:134、tool-capability.ts:70）在慢门户上会放大抖动：浏览器读工具单独放宽超时，eval 覆盖慢页面用例。
