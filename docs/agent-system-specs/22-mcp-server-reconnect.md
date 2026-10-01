# Spec 22: MCP Server Reconnect On Dead Stdio Child

**Target label:** `ready-for-agent`  
**Depends on:** Spec 16 的 MCPManager 接缝现状；批次 0.14.x

## Problem Statement

MCPManager 在启动时连接各 stdio server 后永不重连（`mcp/manager.ts:14` 的 servers Map 只在 init 填充）。子进程死亡后（小内存 ECS 上 chromium OOM 是最可能的死法），stale entry 留在 Map 里，所有调用永远返回 `transient/recoverable`——模型重试也没用，浏览器工具实际变成「一次性的」，直到人工 PM2 重启。生产 worker 是长驻进程，这是浏览器能力的单点生命周期缺陷。

## Solution

callTool 检测到断连类错误（子进程退出、transport closed、write after end）时：移除该 server 的缓存条目 → 重连一次 → 重放当前调用；重连失败则保持既有报错行为（transient + 明确错误信息）。启动健康断言保持不变。

## User Stories

1. 作为求职者，浏览器工具在一次崩溃后能自动恢复，而不是整段时间不可用。
2. 作为运维人员，我希望重连有日志且失败可见，而不是静默半死状态。

## Implementation Decisions

- 断连判定按错误消息特征（`not connected|closed|ended|ENOENT|EPIPE`）收敛到一个谓词函数，不按工具或 server 名特判。
- 每 server 维护单飞重连（in-flight 标志），并发调用在重连期间等待而不是各自拉起子进程。
- 重连成功后重放当前调用一次；重连失败清理条目并返回既有 transient 错误（附「重连失败」原因），下次调用再试。
- optional server 语义不变：重连失败不抛致命，不影响其他 server。
- 连接超时沿用配置的 `timeoutMs`。

## Testing Decisions

- 单测：模拟 callTool 抛断连错误 → server 条目被清除 → initServer 重连被调用 → 调用重放成功。
- 重连失败路径：错误保持 transient、含重连失败原因、不抛致命。
- 并发路径：重连期间第二个调用不触发第二次 initServer（单飞断言）。
- 非断连错误（工具本身报错）不触发重连的负例断言。

## Out of Scope

- 不做按需懒连接（server 仍在启动时连接，Spec 16 的启动健康断言语义不变）。
- 不做自动降级告警渠道（admin 可见性属 runtime-admin 范围，另行考虑）。
- 不换 @playwright/mcp 的版本固定策略（unpinned `npx -y` 的版本漂移另立事项）。

## Further Notes

- 外部声音 #8 的修复项。重连成功日志带 server 名与耗时；失败日志带错误分类。
