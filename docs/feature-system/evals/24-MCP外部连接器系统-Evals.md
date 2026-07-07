# MCP外部连接器系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 MCP外部连接器系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

mcp.config.json、MCPManager、stdio transport、工具发现、动态注册、callTool、formatResult 和降级策略。

## 项目事实

### 关键实现面
- `src/lib/agent/mcp/config.ts`
- `src/lib/agent/mcp/manager.ts`
- `src/lib/agent/mcp/tools.ts`
- `src/app/api/agent/mcp/call/route.ts`
- `mcp.config.json`

### 已落地或部分落地的 eval 资产
- `src/lib/agent/mcp/config.ts`
- `src/lib/agent/mcp/manager.ts`
- `src/lib/agent/mcp/tools.ts`
- `src/__tests__/agent-tool-governance.test.ts`

### 从现有测试读到的行为
- MCP 连接器实现存在 config、manager、tools 三层，但目前缺少专门的 mcp-connectors.test.ts。
- agent-tool-governance.test.ts 已覆盖工具缺治理元数据默认拒绝，可作为动态 MCP 工具接入的安全基线。
- MCP 输出来自外部进程，必须限制长度、错误形态和上下文注入。

### 待补 eval 缺口
- 补 mcp-connectors.test.ts 覆盖 config/env/optional/init/call/shutdown。
- 补动态 MCP 工具 governance metadata 或 default-deny 的 eval。
- 补 API route /api/agent/mcp/call 权限和错误态 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 mcp-connectors.test.ts 覆盖 config/env/optional/init/call/shutdown

**为什么要补**: 这是当前 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/__tests__/agent-tool-governance.test.ts`。
- fixture 必须包含：server name、env keys、tool name、registry name、initialized state 和 formatted result length。
- 断言必须读取：loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补动态 MCP 工具 governance metadata 或 default-deny 的 eval

**为什么要补**: 这是当前 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/__tests__/agent-tool-governance.test.ts`。
- fixture 必须包含：server name、env keys、tool name、registry name、initialized state 和 formatted result length。
- 断言必须读取：loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 API route /api/agent/mcp/call 权限和错误态 eval

**为什么要补**: 这是当前 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/__tests__/agent-tool-governance.test.ts`。
- fixture 必须包含：server name、env keys、tool name、registry name、initialized state 和 formatted result length。
- 断言必须读取：loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 MCP外部连接器系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. loadMCPConfig 解析 env:VAR

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- `src/lib/agent/mcp/config.ts`负责读取`mcp.config.json`，并把`env:SERPAPI_API_KEY`这类占位符解析成服务端进程环境变量。`getServerEnv(serverName)`只返回非空env字段。
- 1. `mcp.config.json`只保存server包名和env引用，不保存真实密钥。 2. optional server缺少key或启动失败时，核心Agent流程仍能运行。 3. `/api/agent/mcp/call`缺少`server/tool`会返回400。 4. 连接成功的MCP工具会被转换成`ToolDefinition`，并以serv...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“loadMCPConfig 解析 env:VAR”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“loadMCPConfig 解析 env:VAR”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“loadMCPConfig 解析 env:VAR”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. getServerEnv 过滤空 env

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- `src/lib/agent/mcp/config.ts`负责读取`mcp.config.json`，并把`env:SERPAPI_API_KEY`这类占位符解析成服务端进程环境变量。`getServerEnv(serverName)`只返回非空env字段。
- 1. `mcp.config.json`只保存server包名和env引用，不保存真实密钥。 2. optional server缺少key或启动失败时，核心Agent流程仍能运行。 3. `/api/agent/mcp/call`缺少`server/tool`会返回400。 4. 连接成功的MCP工具会被转换成`ToolDefinition`，并以serv...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“getServerEnv 过滤空 env”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“getServerEnv 过滤空 env”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“getServerEnv 过滤空 env”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. 可连接 server 的 tools 注册进 registry

**状态**: 已有自动化覆盖

**项目依据**:
- 这条API不是通用远程执行入口。它只代理已配置、已初始化、已注册的MCP server，并把结果转成统一`ToolResult`。
- 1. 动态MCP工具注册依赖`registerMCPTools()`被调用，不能假设所有server工具都自动进入每次Agent启动。 2. `mcp.config.json`没有配置只读数据库MCP，不能把MCP当成数据库审计入口。 3. `search_jobs`基于DuckDuckGo摘要，不等同于Boss直聘、拉勾、猎聘的正式岗位API。 4. 路线...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“可连接 server 的 tools 注册进 registry”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“可连接 server 的 tools 注册进 registry”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“可连接 server 的 tools 注册进 registry”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: blocks read-only advice from claiming resume saves through save tools

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. callTool 返回统一 ToolResult

**状态**: 已有自动化覆盖

**项目依据**:
- 这条API不是通用远程执行入口。它只代理已配置、已初始化、已注册的MCP server，并把结果转成统一`ToolResult`。
- 1. `mcp.config.json`只保存server包名和env引用，不保存真实密钥。 2. optional server缺少key或启动失败时，核心Agent流程仍能运行。 3. `/api/agent/mcp/call`缺少`server/tool`会返回400。 4. 连接成功的MCP工具会被转换成`ToolDefinition`，并以serv...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“callTool 返回统一 ToolResult”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“callTool 返回统一 ToolResult”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“callTool 返回统一 ToolResult”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: blocks read-only advice from claiming resume saves through save tools

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 必需 API key 缺失不能静默启动

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 外部信息可以进入Agent判断链路，但只能作为材料，不能变成系统指令。 2. API key和外部服务调用都留在服务端，浏览器不直接持有密钥。 3. 外部服务失败时主流程降级，而不是让JD评估、简历优化、Offer判断整体失败。
- 1. 动态MCP工具注册依赖`registerMCPTools()`被调用，不能假设所有server工具都自动进入每次Agent启动。 2. `mcp.config.json`没有配置只读数据库MCP，不能把MCP当成数据库审计入口。 3. `search_jobs`基于DuckDuckGo摘要，不等同于Boss直聘、拉勾、猎聘的正式岗位API。 4. 路线...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“必需 API key 缺失不能静默启动”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“必需 API key 缺失不能静默启动”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“必需 API key 缺失不能静默启动”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. optional server 缺凭证只跳过

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 三个服务都标记为`optional: true`。这意味着缺少key、包启动失败或外部服务不可用时，系统会记录warning并跳过对应server，不会阻塞Agent主流程。这个设计符合求职助手的优先级：用户已经提供的JD、简历、Offer文本必须能继续处理；外部连接只是增强层。
- 1. `mcp.config.json`只保存server包名和env引用，不保存真实密钥。 2. optional server缺少key或启动失败时，核心Agent流程仍能运行。 3. `/api/agent/mcp/call`缺少`server/tool`会返回400。 4. 连接成功的MCP工具会被转换成`ToolDefinition`，并以serv...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“optional server 缺凭证只跳过”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“optional server 缺凭证只跳过”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“optional server 缺凭证只跳过”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. server not connected 返回失败

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. `mcp.config.json`只保存server包名和env引用，不保存真实密钥。 2. optional server缺少key或启动失败时，核心Agent流程仍能运行。 3. `/api/agent/mcp/call`缺少`server/tool`会返回400。 4. 连接成功的MCP工具会被转换成`ToolDefinition`，并以serv...
- 三个服务都标记为`optional: true`。这意味着缺少key、包启动失败或外部服务不可用时，系统会记录warning并跳过对应server，不会阻塞Agent主流程。这个设计符合求职助手的优先级：用户已经提供的JD、简历、Offer文本必须能继续处理；外部连接只是增强层。
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“server not connected 返回失败”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“server not connected 返回失败”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“server not connected 返回失败”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. MCP 工具不能绕过治理

**状态**: 已有自动化覆盖

**项目依据**:
- MCP外部连接器系统解决的是纸鸢求职助手从“只处理用户粘贴材料”走向“能连接真实求职环境”的问题。求职链路里有大量信息不在本地：公司公开资料、岗位搜索结果、面试地点、通勤路线、天气、招聘平台信息、行业新闻和公开百科。连接器系统把这些外部信息封装成受控工具，让Agent可以读取外部事实，但不能绕过任务契约、写入校验和用户确认。
- 1. 动态MCP工具注册依赖`registerMCPTools()`被调用，不能假设所有server工具都自动进入每次Agent启动。 2. `mcp.config.json`没有配置只读数据库MCP，不能把MCP当成数据库审计入口。 3. `search_jobs`基于DuckDuckGo摘要，不等同于Boss直聘、拉勾、猎聘的正式岗位API。 4. 路线...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“MCP 工具不能绕过治理”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“MCP 工具不能绕过治理”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“MCP 工具不能绕过治理”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: binds governance read-back requirements to the runtime success gate
- `src/__tests__/agent-tool-governance.test.ts`: blocks read-only advice from claiming resume saves through save tools

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. registerMCPTools 多次调用重复注册

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 动态MCP工具注册依赖`registerMCPTools()`被调用，不能假设所有server工具都自动进入每次Agent启动。 2. `mcp.config.json`没有配置只读数据库MCP，不能把MCP当成数据库审计入口。 3. `search_jobs`基于DuckDuckGo摘要，不等同于Boss直聘、拉勾、猎聘的正式岗位API。 4. 路线...
- 这条API不是通用远程执行入口。它只代理已配置、已初始化、已注册的MCP server，并把结果转成统一`ToolResult`。
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“registerMCPTools 多次调用重复注册”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“registerMCPTools 多次调用重复注册”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“registerMCPTools 多次调用重复注册”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. 长 JSON 未截断

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. `mcp.config.json`只保存server包名和env引用，不保存真实密钥。 2. optional server缺少key或启动失败时，核心Agent流程仍能运行。 3. `/api/agent/mcp/call`缺少`server/tool`会返回400。 4. 连接成功的MCP工具会被转换成`ToolDefinition`，并以serv...
- `mcp.config.json`当前配置了三个可选服务：
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“长 JSON 未截断”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“长 JSON 未截断”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“长 JSON 未截断”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. shutdown 未清 servers/initialized

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 当前 feature 文档已定义该能力的产品目标、入口、边界和验收口径；本 eval 只把这些预期落到可复跑证据上。
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“shutdown 未清 servers/initialized”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“shutdown 未清 servers/initialized”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“shutdown 未清 servers/initialized”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: does not have high-priority route conflicts
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. MCP 写入工具默认放行

**状态**: 已有自动化覆盖

**项目依据**:
- MCP外部连接器系统解决的是纸鸢求职助手从“只处理用户粘贴材料”走向“能连接真实求职环境”的问题。求职链路里有大量信息不在本地：公司公开资料、岗位搜索结果、面试地点、通勤路线、天气、招聘平台信息、行业新闻和公开百科。连接器系统把这些外部信息封装成受控工具，让Agent可以读取外部事实，但不能绕过任务契约、写入校验和用户确认。
- 1. 动态MCP工具注册依赖`registerMCPTools()`被调用，不能假设所有server工具都自动进入每次Agent启动。 2. `mcp.config.json`没有配置只读数据库MCP，不能把MCP当成数据库审计入口。 3. `search_jobs`基于DuckDuckGo摘要，不等同于Boss直聘、拉勾、猎聘的正式岗位API。 4. 路线...
- 主要实现面：`src/lib/agent/mcp/config.ts`、`src/lib/agent/mcp/manager.ts`、`src/lib/agent/mcp/tools.ts`、`src/app/api/agent/mcp/call/route.ts`。

**输入/fixture**:
- 正例：optional MCP server、env:VAR 配置、listTools 结果和 callTool 响应，用来验证“MCP 写入工具默认放行”的成功路径。
- 反例：缺 key、server not connected、长 JSON、重复注册、MCP 写入工具，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：server name、env keys、tool name、registry name、initialized state 和 formatted result length；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 mcp.config.json、MCPManager、registerMCPTools 和 /api/agent/mcp/call 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“MCP 写入工具默认放行”对应动作，并记录请求、工具调用或页面状态。
3. 读取 loaded config、server env、ToolDefinition、ToolResult、shutdown state 和治理 metadata，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“MCP 写入工具默认放行”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 MCP外部连接器系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/agent-tool-governance.test.ts`: classifies every registered tool with governance metadata
- `src/__tests__/agent-tool-governance.test.ts`: default-denies tools missing governance metadata in tests and development
- `src/__tests__/agent-tool-governance.test.ts`: blocks read-only advice from claiming resume saves through save tools

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/lib/agent/mcp/config.ts`
- `src/lib/agent/mcp/manager.ts`
- `src/lib/agent/mcp/tools.ts`
- `src/__tests__/agent-tool-governance.test.ts`
  - classifies every registered tool with governance metadata
  - does not have high-priority route conflicts
  - default-denies tools missing governance metadata in tests and development
  - binds governance read-back requirements to the runtime success gate
  - maps self-positioning to guidance instead of profile write
  - blocks high-risk writes during guidance contracts
  - keeps resume query contracts read-only
  - blocks high-risk writes while a route still needs clarification
  - ...


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- MCP外部连接器系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
