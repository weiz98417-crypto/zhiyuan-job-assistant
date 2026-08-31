# Feature System Evals 文档索引

本目录把 `docs/feature-system` 中 01-28 号功能的 evals 资产按功能拆开记录。27 号“岗位发现 Agent 化”文档本身已经包含完整实施任务和 eval 规范，本目录同时保留一份索引用副本，方便从 evals 目录统一查找。

每份文档都必须区分：
- 已落地或部分落地的 eval 资产：已经存在的 Vitest、脚本、fixture 或文档覆盖测试。
- 待补 eval 缺口：产品预期存在，但还缺自动化证据。
- 基线 Evals：验证主链路是否成立。
- 边界 Evals：验证权限、写入、路由、隐私、数据作用域不会越界。
- 回归 Evals：固定项目已经出现或高概率复发的问题。

## 功能索引

| 功能 | Eval 文档 |
|---|---|
| 01 认证准入用户管理与数据隔离系统 | [01-认证准入用户管理与数据隔离系统-Evals.md](01-%E8%AE%A4%E8%AF%81%E5%87%86%E5%85%A5%E7%94%A8%E6%88%B7%E7%AE%A1%E7%90%86%E4%B8%8E%E6%95%B0%E6%8D%AE%E9%9A%94%E7%A6%BB%E7%B3%BB%E7%BB%9F-Evals.md) |
| 02 首页求职工作台 | [02-首页求职工作台-Evals.md](02-%E9%A6%96%E9%A1%B5%E6%B1%82%E8%81%8C%E5%B7%A5%E4%BD%9C%E5%8F%B0-Evals.md) |
| 03 全局导航与应用外壳 | [03-全局导航与应用外壳-Evals.md](03-%E5%85%A8%E5%B1%80%E5%AF%BC%E8%88%AA%E4%B8%8E%E5%BA%94%E7%94%A8%E5%A4%96%E5%A3%B3-Evals.md) |
| 04 Agent Chat会话状态与前端呈现系统 | [04-Agent Chat会话状态与前端呈现系统-Evals.md](04-Agent%20Chat%E4%BC%9A%E8%AF%9D%E7%8A%B6%E6%80%81%E4%B8%8E%E5%89%8D%E7%AB%AF%E5%91%88%E7%8E%B0%E7%B3%BB%E7%BB%9F-Evals.md) |
| 05 图片识别与截图路由系统 | [05-图片识别与截图路由系统-Evals.md](05-%E5%9B%BE%E7%89%87%E8%AF%86%E5%88%AB%E4%B8%8E%E6%88%AA%E5%9B%BE%E8%B7%AF%E7%94%B1%E7%B3%BB%E7%BB%9F-Evals.md) |
| 06 Agent路由任务契约与子Agent编排系统 | [06-Agent路由任务契约与子Agent编排系统-Evals.md](06-Agent%E8%B7%AF%E7%94%B1%E4%BB%BB%E5%8A%A1%E5%A5%91%E7%BA%A6%E4%B8%8E%E5%AD%90Agent%E7%BC%96%E6%8E%92%E7%B3%BB%E7%BB%9F-Evals.md) |
| 07 Agent工具治理与读回校验 | [07-Agent工具治理与读回校验-Evals.md](07-Agent%E5%B7%A5%E5%85%B7%E6%B2%BB%E7%90%86%E4%B8%8E%E8%AF%BB%E5%9B%9E%E6%A0%A1%E9%AA%8C-Evals.md) |
| 08 纸鸢求职助手评分系统 | [08-纸鸢求职助手评分系统-Evals.md](08-%E7%BA%B8%E9%B8%A2%E6%B1%82%E8%81%8C%E5%8A%A9%E6%89%8B%E8%AF%84%E5%88%86%E7%B3%BB%E7%BB%9F-Evals.md) |
| 09 岗位发现扫描系统 | [09-岗位发现扫描系统-Evals.md](09-%E5%B2%97%E4%BD%8D%E5%8F%91%E7%8E%B0%E6%89%AB%E6%8F%8F%E7%B3%BB%E7%BB%9F-Evals.md) |
| 10 投递追踪系统 | [10-投递追踪系统-Evals.md](10-%E6%8A%95%E9%80%92%E8%BF%BD%E8%B8%AA%E7%B3%BB%E7%BB%9F-Evals.md) |
| 11 简历工作台与版本管理系统 | [11-简历工作台与版本管理系统-Evals.md](11-%E7%AE%80%E5%8E%86%E5%B7%A5%E4%BD%9C%E5%8F%B0%E4%B8%8E%E7%89%88%E6%9C%AC%E7%AE%A1%E7%90%86%E7%B3%BB%E7%BB%9F-Evals.md) |
| 12 简历修改提案与回滚系统 | [12-简历修改提案与回滚系统-Evals.md](12-%E7%AE%80%E5%8E%86%E4%BF%AE%E6%94%B9%E6%8F%90%E6%A1%88%E4%B8%8E%E5%9B%9E%E6%BB%9A%E7%B3%BB%E7%BB%9F-Evals.md) |
| 13 简历优化Judge引擎 | [13-简历优化Judge引擎-Evals.md](13-%E7%AE%80%E5%8E%86%E4%BC%98%E5%8C%96Judge%E5%BC%95%E6%93%8E-Evals.md) |
| 14 优秀简历记忆系统 | [14-优秀简历记忆系统-Evals.md](14-%E4%BC%98%E7%A7%80%E7%AE%80%E5%8E%86%E8%AE%B0%E5%BF%86%E7%B3%BB%E7%BB%9F-Evals.md) |
| 15 求职画像系统 | [15-求职画像系统-Evals.md](15-%E6%B1%82%E8%81%8C%E7%94%BB%E5%83%8F%E7%B3%BB%E7%BB%9F-Evals.md) |
| 16 面试教练故事库与复盘系统 | [16-面试教练故事库与复盘系统-Evals.md](16-%E9%9D%A2%E8%AF%95%E6%95%99%E7%BB%83%E6%95%85%E4%BA%8B%E5%BA%93%E4%B8%8E%E5%A4%8D%E7%9B%98%E7%B3%BB%E7%BB%9F-Evals.md) |
| 17 Offer评估与对比系统 | [17-Offer评估与对比系统-Evals.md](17-Offer%E8%AF%84%E4%BC%B0%E4%B8%8E%E5%AF%B9%E6%AF%94%E7%B3%BB%E7%BB%9F-Evals.md) |
| 18 Analytics求职数据分析系统 | [18-Analytics求职数据分析系统-Evals.md](18-Analytics%E6%B1%82%E8%81%8C%E6%95%B0%E6%8D%AE%E5%88%86%E6%9E%90%E7%B3%BB%E7%BB%9F-Evals.md) |
| 19 个人设置与数据管理系统 | [19-个人设置与数据管理系统-Evals.md](19-%E4%B8%AA%E4%BA%BA%E8%AE%BE%E7%BD%AE%E4%B8%8E%E6%95%B0%E6%8D%AE%E7%AE%A1%E7%90%86%E7%B3%BB%E7%BB%9F-Evals.md) |
| 20 文件导出与PDF生成系统 | [20-文件导出与PDF生成系统-Evals.md](20-%E6%96%87%E4%BB%B6%E5%AF%BC%E5%87%BA%E4%B8%8EPDF%E7%94%9F%E6%88%90%E7%B3%BB%E7%BB%9F-Evals.md) |
| 21 后台运营治理与团队质量系统 | [21-后台运营治理与团队质量系统-Evals.md](21-%E5%90%8E%E5%8F%B0%E8%BF%90%E8%90%A5%E6%B2%BB%E7%90%86%E4%B8%8E%E5%9B%A2%E9%98%9F%E8%B4%A8%E9%87%8F%E7%B3%BB%E7%BB%9F-Evals.md) |
| 22 Agent Run证据Review与Eval候选治理系统 | [22-Agent Run证据Review与Eval候选治理系统-Evals.md](22-Agent%20Run%E8%AF%81%E6%8D%AEReview%E4%B8%8EEval%E5%80%99%E9%80%89%E6%B2%BB%E7%90%86%E7%B3%BB%E7%BB%9F-Evals.md) |
| 23 PostgreSQL与pgvector数据层 | [23-PostgreSQL与pgvector数据层-Evals.md](23-PostgreSQL%E4%B8%8Epgvector%E6%95%B0%E6%8D%AE%E5%B1%82-Evals.md) |
| 24 MCP外部连接器系统 | [24-MCP外部连接器系统-Evals.md](24-MCP%E5%A4%96%E9%83%A8%E8%BF%9E%E6%8E%A5%E5%99%A8%E7%B3%BB%E7%BB%9F-Evals.md) |
| 25 工程变更治理与自动化优化Loop系统 | [25-工程变更治理与自动化优化Loop系统-Evals.md](25-%E5%B7%A5%E7%A8%8B%E5%8F%98%E6%9B%B4%E6%B2%BB%E7%90%86%E4%B8%8E%E8%87%AA%E5%8A%A8%E5%8C%96%E4%BC%98%E5%8C%96Loop%E7%B3%BB%E7%BB%9F-Evals.md) |
| 26 用户注入防范与内容安全系统 | [26-用户注入防范与内容安全系统-Evals.md](26-%E7%94%A8%E6%88%B7%E6%B3%A8%E5%85%A5%E9%98%B2%E8%8C%83%E4%B8%8E%E5%86%85%E5%AE%B9%E5%AE%89%E5%85%A8%E7%B3%BB%E7%BB%9F-Evals.md) |
| 27 岗位发现 Agent 化实施任务 | [27-岗位发现Agent化实施任务与Evals.md](27-%E5%B2%97%E4%BD%8D%E5%8F%91%E7%8E%B0Agent%E5%8C%96%E5%AE%9E%E6%96%BD%E4%BB%BB%E5%8A%A1%E4%B8%8EEvals.md) |
| 28 Durable Agent Run 与自恢复运行时 | [28-Durable-Agent-Run与自恢复运行时-Evals.md](28-Durable-Agent-Run%E4%B8%8E%E8%87%AA%E6%81%A2%E5%A4%8D%E8%BF%90%E8%A1%8C%E6%97%B6-Evals.md) |
| 29 生产全量页面与对话旅程验收 | [29-生产全量页面与对话旅程验收-Evals.md](29-%E7%94%9F%E4%BA%A7%E5%85%A8%E9%87%8F%E9%A1%B5%E9%9D%A2%E4%B8%8E%E5%AF%B9%E8%AF%9D%E6%97%85%E7%A8%8B%E9%AA%8C%E6%94%B6-Evals.md) |

## 维护规则

- 新增 feature-system 文档时，必须同步新增对应 eval 文档。
- 每份 eval 文档必须包含“评测对象”“项目事实”“实施与治理任务清单”“基线/边界/回归 Evals”“测试文件映射”。
- 高风险写入类功能必须有 read-back、用户作用域或事务回滚 eval。
- Agent 类功能必须有路由、工具白名单、任务切换或 evidence eval。
- 页面类功能至少要有空态、错误态、跳转或布局回归 eval。
