## 1. 工具错误自描述

- [x] 1.1 `read-file.ts`：permanent 错误分支查询 `/api/cv/data` + `/api/cv/references`，返回可用资源列表
- [x] 1.2 `get-report-detail.ts`：permanent 错误分支查询最近 5 份报告，返回编号/公司/岗位列表
- [x] 1.3 `get-reference-detail.ts`：permanent 错误分支查询 `/api/cv/references`，返回可用参考简历列表

## 2. Agent Loop 强制禁调工具

- [x] 2.1 `client-runner.ts`：`degradeToUser` 路径的 errorObs 末尾追加 `"禁止调用任何工具。你必须在下一轮直接输出文字回复。"`
- [x] 2.2 `server-runner.ts`：同步 2.1 修改

## 3. Agent 提示词注入可用资源

- [x] 3.1 `resume-agent.ts`：`buildResumePrompt` 中查询 `/api/cv/references`，注入 `"可用资源: read_file(path='我的简历'), 参考简历: #1 张雯茜..."`
- [x] 3.2 `evaluate-agent.ts`：`buildEvalPrompt` 中查询最近报告，注入 `"最近报告: #42 字节, #41 阿里"`

## 4. 验证

- [ ] 4.1 Resume agent "帮我优化简历" — read_file 猜错 path 后自动纠正，不崩溃不乱闪
- [ ] 4.2 工具返回 permanent 错误后 LLM 直接告知用户，不调用任何工具
- [x] 4.3 TypeScript 编译零新增错误
