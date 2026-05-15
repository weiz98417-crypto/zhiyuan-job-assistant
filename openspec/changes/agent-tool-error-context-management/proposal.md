## Why

Agent 工具调用有两个系统性缺陷导致灾难体验:(1)工具结果无错误分类,LLM 不知道什么该重试什么该告知用户,对乱码/编码错误反复重试到思考上限(2)无原生文件读取工具,依赖 Claude Code Read 工具直接灌入全文,上下文频繁撑爆。本次参考 OpenAI Assistants(errorCategory 四态)、Cursor Agent(智能路由 read_file)、LangChain(ToolException 分类)三套成熟模式一并解决。

## What Changes

- ToolResult 新增 `errorCategory` 字段:`ok` | `transient` | `permanent` | `need_user_input`,替代当前脆弱的 `recoverable?: boolean`
- 创建原生 `read_file` 工具,按路径智能路由(参考简历→DB/我的简历→get_profile/cv.md→服务端读取+乱码检测+截断),**替换 Claude Code Read 工具**
- 系统 prompt 新增"工具结果分类"策略表 + "上下文预算"铁律
- Agent Loop 质量检查升级为基于 errorCategory 的统一处理,淘汰分散的 qualityHint 字符串拼接

## Capabilities

### New Capabilities

- `tool-error-category`: 工具结果错误分类——ToolResult 自带 ok/transient/permanent/need_user_input,LLM 和 Loop 引擎据此决定重试/降级/询问
- `agent-read-file`: 原生智能文件读取工具——按路径路由到 DB API / 服务端读取 / 用户画像,强制上下文截断,乱码检测后标记 permanent

### Modified Capabilities

- `agent-loop-engine`: Quality Gate 改为读取 errorCategory 而非拼接 qualityHint 字符串
- `agent-loop-client`: 同上,客户端 Loop 同步
- `agent-tools`: ToolResult 接口新增 errorCategory 字段(向后兼容)

## Impact

- `src/lib/agent/tools/types.ts` — 新增 ErrorCategory,修改 ToolResult
- `src/lib/agent/tools/query/read-file.ts` — NEW 原生 read_file 工具
- `src/app/api/agent/read-file/route.ts` — NEW 服务端读取路由
- `src/lib/agent/tools/index.ts` — 注册 read_file
- `src/lib/agent/prompt.ts` — 新增错误处理策略表 + 上下文预算
- `src/lib/agent/loop/client-runner.ts` — 统一 errorCategory 处理
- `src/lib/agent/loop/server-runner.ts` — 同上
