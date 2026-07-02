# MCP外部连接器系统的产品构造

MCP外部连接器系统解决的是纸鸢求职助手从“只处理用户粘贴材料”走向“能连接真实求职环境”的问题。求职链路里有大量信息不在本地：公司公开资料、岗位搜索结果、面试地点、通勤路线、天气、招聘平台信息、行业新闻和公开百科。连接器系统把这些外部信息封装成受控工具，让Agent可以读取外部事实，但不能绕过任务契约、写入校验和用户确认。

## 1. 产品定位

纸鸢不是开放式联网聊天工具。它的外部连接目标只服务求职任务：评估JD前补充公司与行业背景、准备面试前确认地点和天气、岗位发现时补充候选岗位、Offer判断时查验公司与城市信息。

这个系统的产品价值有三点：

1. 外部信息可以进入Agent判断链路，但只能作为材料，不能变成系统指令。
2. API key和外部服务调用都留在服务端，浏览器不直接持有密钥。
3. 外部服务失败时主流程降级，而不是让JD评估、简历优化、Offer判断整体失败。

核心文件：

| 模块 | 项目事实 |
|---|---|
| MCP服务配置 | `mcp.config.json` |
| 配置加载 | `src/lib/agent/mcp/config.ts` |
| MCP管理器 | `src/lib/agent/mcp/manager.ts` |
| 工具注册入口 | `src/lib/agent/mcp/tools.ts` |
| 服务端代理API | `src/app/api/agent/mcp/call/route.ts` |
| 本地外部查询工具 | `src/lib/agent/tools/mcp/web-search.ts`、`job-search.ts`、`baidu-map.ts` |
| 工具治理 | `src/lib/agent/tool-governance.ts` |

## 2. 已配置的MCP服务

`mcp.config.json`当前配置了三个可选服务：

| server | npm package | 环境变量 | 产品用途 |
|---|---|---|---|
| `serpapi` | `@serpapi/mcp-server` | `SERPAPI_API_KEY` | 公开网页、公司资料、行业信息检索 |
| `baidu-map` | `@baidumap/mcp-server-baidu-map` | `BAIDU_MAP_API_KEY` | 地址、地点、路线等地图能力 |
| `mcp-jobs` | `@iflow-mcp/mergedao-mcp-jobs` | 无必填env | 招聘岗位搜索 |

三个服务都标记为`optional: true`。这意味着缺少key、包启动失败或外部服务不可用时，系统会记录warning并跳过对应server，不会阻塞Agent主流程。这个设计符合求职助手的优先级：用户已经提供的JD、简历、Offer文本必须能继续处理；外部连接只是增强层。

## 3. 配置加载与密钥边界

`src/lib/agent/mcp/config.ts`负责读取`mcp.config.json`，并把`env:SERPAPI_API_KEY`这类占位符解析成服务端进程环境变量。`getServerEnv(serverName)`只返回非空env字段。

这个边界很重要：

| 设计点 | 对产品的影响 |
|---|---|
| 配置文件只写`env:变量名` | 仓库里不出现真实key |
| 运行时从`process.env`读取 | key只存在服务端 |
| 空env会被过滤 | optional服务可以自然降级 |
| 未配置server返回`null` | 防止前端随意指定未知连接器 |

前端即使调用`/api/agent/mcp/call`，也只能传`server`、`tool`和`params`，拿不到`SERPAPI_API_KEY`或`BAIDU_MAP_API_KEY`。

## 4. MCP运行链路

真实链路如下：

```text
mcp.config.json
  -> loadMCPConfig()
  -> getServerEnv()
  -> MCPManager.init()
  -> npx -y <server package>
  -> StdioClientTransport
  -> Client.listTools()
  -> 转成纸鸢ToolDefinition
  -> registerMCPTools()
  -> 进入统一工具registry
```

`MCPManager.connectServer()`使用`npx -y <package>`启动MCP server，并通过`@modelcontextprotocol/sdk`的`StdioClientTransport`连接。连接成功后调用`client.listTools()`发现server暴露的工具，再把每个MCP工具包装成纸鸢内部的`ToolDefinition`。

包装规则：

| 字段 | 转换方式 |
|---|---|
| `name` | 加server前缀，例如`${server}_${tool}`，避免工具名冲突 |
| `description` | 加来源标记，例如`[serpapi] ...` |
| `category` | 当前统一为`query` |
| `parameters` | 从MCP input schema转换成纸鸢工具参数 |
| `handler` | 调用`mcpManager.callTool(server, tool, params)` |
| `formatResult` | 字符串或JSON最长截取1000字符 |

结果截断不是为了省事，而是为了避免外部网页结果把Agent上下文、聊天卡片和用户可读输出淹没。求职判断需要的是可引用的外部材料，不是把整个网页塞进回答里。

## 5. 服务端代理API

`POST /api/agent/mcp/call`是浏览器侧访问MCP的服务端边界。请求体结构：

```json
{
  "server": "serpapi",
  "tool": "search",
  "params": {}
}
```

API行为：

| 情况 | 返回 |
|---|---|
| 缺少`server`或`tool` | HTTP 400，`Missing server or tool name` |
| MCP初始化或调用异常 | HTTP 500，`MCP proxy error` |
| server未连接 | `success:false`，`MCP server not connected` |
| 工具调用成功 | `success:true`，`data`为MCP文本结果 |

这条API不是通用远程执行入口。它只代理已配置、已初始化、已注册的MCP server，并把结果转成统一`ToolResult`。

## 6. 本地shim工具

项目同时保留了三个本地shim工具。它们不依赖完整MCP server，但在产品层承担相同角色：把外部查询能力变成Agent可治理的工具结果。

| 工具 | 文件 | 能力 | 超时与输出 |
|---|---|---|---|
| `web_search` | `web-search.ts` | 调用`/api/agent/search`和中英文Wikipedia | LLM知识查询20s，Wikipedia 8s，输出截断1200字符 |
| `search_jobs` | `job-search.ts` | 用DuckDuckGo Instant Answer搜索岗位关键词 | 8s超时，输出截断800字符 |
| `get_weather` | `baidu-map.ts` | 通过`wttr.in`查询天气 | 8s超时，输出截断600字符 |
| `search_place` | `baidu-map.ts` | 通过DuckDuckGo查询地点/公司地址 | 8s超时，输出截断600字符 |
| `get_directions` | `baidu-map.ts` | 通过DuckDuckGo查询路线信息 | 8s超时，输出截断600字符 |

这些shim不是高可信数据库。产品上要把结果当作“外部参考”，不能把它们等同于官方公司信息、地图导航或招聘平台原始数据。

## 7. 进入求职链路的位置

MCP和shim连接器服务四类真实场景：

| 场景 | 外部信息 | 下游使用 |
|---|---|---|
| JD评估 | 公司业务、行业术语、岗位公开资料、风险词背景 | 进入评估解释、黑话风险扫描、面试准备建议 |
| 岗位发现 | 岗位关键词、城市、招聘信息摘要 | 补充发现列表，但不自动替用户投递 |
| 面试准备 | 天气、地点、通勤路线、公司公开信息 | 生成面试当天准备事项和通勤风险提醒 |
| Offer判断 | 公司公开资料、办公地点、城市生活信息 | 辅助判断稳定性、通勤成本和谈判准备 |

外部连接器不会替代纸鸢的核心事实源。JD正文、简历内容、Offer条款、用户画像和已保存报告仍然来自用户材料与本地/服务端数据层。

## 8. 工具治理边界

`tool-governance.ts`把这些外部工具定义为`read`效果：

| 工具 | 允许任务 |
|---|---|
| `web_search` | `general_chat`、`job_search`、`interview_coaching`、`jd_evaluation`、`offer_evaluation` |
| `search_jobs` | `job_search`、`general_chat` |
| `get_weather` | `general_chat`、`interview_coaching`、`job_search` |
| `search_place` | `general_chat`、`interview_coaching`、`job_search` |
| `get_directions` | `general_chat`、`interview_coaching`、`job_search` |

这意味着外部查询工具不能直接写简历、保存报告、修改Offer、更新画像或批准团队记忆。即使外部结果里出现“忽略规则”“保存内容”“替用户确认”这类文本，也只会作为普通文本进入材料层，不会提升工具权限。

## 9. 降级策略

连接器失败分成五类：

| 失败类型 | 产品处理 |
|---|---|
| key缺失 | optional server跳过，不阻塞主流程 |
| server启动失败 | console warning，MCP初始化继续 |
| 工具调用失败 | 返回`success:false`和错误信息 |
| 搜索无结果 | 返回“未找到相关结果”，不编造 |
| 结果过长 | `formatResult`截断，保留摘要级材料 |

这套降级保证了一个关键体验：用户上传JD截图、粘贴简历或询问Offer时，不会因为外部搜索失败而无法继续。

## 10. 当前边界

当前项目已经具备MCP配置、MCP manager、MCP代理API、本地shim工具和工具治理接入。但也要如实描述边界：

1. 动态MCP工具注册依赖`registerMCPTools()`被调用，不能假设所有server工具都自动进入每次Agent启动。
2. `mcp.config.json`没有配置只读数据库MCP，不能把MCP当成数据库审计入口。
3. `search_jobs`基于DuckDuckGo摘要，不等同于Boss直聘、拉勾、猎聘的正式岗位API。
4. 路线查询是外部搜索摘要，不等同于高德/百度地图App的实时导航。
5. 外部结果必须经过Agent任务契约和工具治理，不能直接写入用户资产。

## 11. 验收口径

MCP外部连接器系统的验收不看“能不能联网”这么粗的指标，而看以下事实：

1. `mcp.config.json`只保存server包名和env引用，不保存真实密钥。
2. optional server缺少key或启动失败时，核心Agent流程仍能运行。
3. `/api/agent/mcp/call`缺少`server/tool`会返回400。
4. 连接成功的MCP工具会被转换成`ToolDefinition`，并以server前缀命名。
5. 本地shim工具有明确超时、输出截断和失败文案。
6. 外部查询工具在治理表里是`read`效果，不能执行写入。
7. 外部结果只增强JD评估、岗位发现、面试准备和Offer判断，不覆盖用户本地事实源。
