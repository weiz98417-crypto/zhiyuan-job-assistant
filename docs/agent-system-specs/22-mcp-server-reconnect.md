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

- 断连判定按错误消息特征收敛到一个 **case-insensitive** 谓词函数（`not connected|connection closed|ended|ENOENT|EPIPE`——覆盖 SDK 的 "Not connected"/"Connection closed" 与 manager 自产的 "MCP server not connected: X"），不按工具或 server 名特判。
- 每 server 维护单飞重连（in-flight 标志），并发调用在重连期间等待而不是各自拉起子进程。
- 重连成功后重放当前调用一次；重连失败清理条目并返回既有 transient 错误（附「重连失败」原因），下次调用再试（自产错误消息命中谓词，保证该路径可重试）。
- optional server 语义不变：重连失败不抛致命，不影响其他 server。
- 连接超时沿用配置的 `timeoutMs`；配置与 env 沿用 `loadMCPConfig` 的进程内缓存快照（密钥轮换后重连拿旧值——接受的取舍，重启进程刷新）。
- 重连失败的短暂窗口内 `getServerTools` 返回空：既有调用方（如按名查找工具的服务）会瞬时见不到该 server 工具，属可接受的瞬态，不做兼容层。

## Testing Decisions

- 单测：模拟 callTool 抛断连错误（覆盖 SDK 消息与 manager 自产消息两种形态、大小写混合）→ server 条目被清除 → initServer 重连被调用 → 调用重放成功。
- 重连失败路径：错误保持 transient、含重连失败原因、不抛致命；失败后下次调用再次触发重连尝试。
- 并发路径：重连期间第二个调用不触发第二次 initServer（单飞断言）。
- 非断连错误（工具本身报错、SDK 超时错误）不触发重连的负例断言。

## Out of Scope

- 不做按需懒连接（server 仍在启动时连接，Spec 16 的启动健康断言语义不变）。
- **僵尸/半死进程形态**：子进程无 close 事件时 callTool 挂到超时，SDK 超时错误消息不命中谓词——该形态本 spec 不覆盖（自动恢复仅覆盖已确认断连），记录为已知边界。
- 不做自动降级告警渠道（admin 可见性属 runtime-admin 范围，另行考虑）。
- 不换 @playwright/mcp 的版本固定策略（另立事项——但注意交互：见 Further Notes）。

## Further Notes

- 外部声音 #8 的修复项。重连成功日志带 server 名与耗时；失败日志带错误分类。
- **重连 × 版本漂移的交互**：`npx -y` 未固定版本时，重连等于运行中换二进制，listTools 可能返回不同工具集且 registry 不重挂载（`mcp/tools.ts` 的 `mcpRegistered` 幂等标记）。本 spec 接受该风险（工具集稳定依赖上游 minor 兼容），彻底解法是版本固定，归入版本固定事项一并决策。
