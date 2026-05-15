## 1. ToolResult.errorCategory — 类型层

- [x] 1.1 在 `src/lib/agent/tools/types.ts` 新增 `ErrorCategory` 类型: `"ok" | "transient" | "permanent" | "need_user_input"`
- [x] 1.2 ToolResult 接口新增 `errorCategory?: ErrorCategory` 字段(可选,向后兼容)
- [x] 1.3 废弃 `recoverable?: boolean`(保留但注释标记 deprecated)

## 2. Loop 引擎 — 基于 errorCategory 的统一处理

- [x] 2.1 在 `client-runner.ts` 新增 `ERROR_CATEGORY_ACTIONS` 表
- [x] 2.2 在 `client-runner.ts` 的质量检查中:优先读 `result.errorCategory`,未设置时 fallback
- [x] 2.3 淘汰 `qualityHint` 字符串拼接方式,改为读 `ERROR_CATEGORY_ACTIONS` 表
- [x] 2.4 在 `server-runner.ts` 中同步以上修改

## 3. 原生 read_file 工具 — 智能路由

- [x] 3.1 创建 `src/app/api/agent/read-file/route.ts`
- [x] 3.2 创建 `src/lib/agent/tools/query/read-file.ts`
- [x] 3.3 在 `src/lib/agent/tools/index.ts` 中注册 `read_file` 工具
- [x] 3.4 将 `read_file` 加入 Agent 工具白名单(resume-agent)

## 4. 系统 Prompt — 错误处理策略 + 上下文预算

- [x] 4.1 新增"工具结果分类"表格
- [x] 4.2 新增"上下文预算"段落
- [x] 4.3 工具路由表指向 `read_file`

## 5. 验证

- [x] 5.1 read_file 问"张雯茜参考简历"→路由到 DB 查询
- [x] 5.2 read_file 读乱码→errorCategory=permanent→不重试
- [x] 5.3 transient→换词重试最多1次
- [x] 5.4 编译通过,TypeScript 无新增错误(仅 pre-existing errors)
- [x] 5.5 旧工具 backward-compat fallback
