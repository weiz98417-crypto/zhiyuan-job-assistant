## ADDED Requirements

### Requirement: 原生智能文件读取

系统 SHALL 提供原生 `read_file` 工具,按路径语义智能路由到不同数据源,始终控制返回内容大小,替换 Claude Code 内置 Read 工具。

#### Scenario: 路由到参考简历数据库

- **WHEN** path 参数匹配 "参考简历" 或包含参考简历名称
- **THEN** 工具调用 `/api/cv/references/{id}` 从数据库查询
- **AND** 返回结构化 sections 内容,不超过 2000 字符
- **AND** errorCategory 为 "ok"

#### Scenario: 路由到用户画像

- **WHEN** path 参数匹配 "我的简历" 或 "个人画像"
- **THEN** 工具调用 `/api/data/profile` 返回摘要
- **AND** 不返回完整简历内容(完整内容由前端卡片渲染)
- **AND** errorCategory 为 "ok"

#### Scenario: 路由到服务端文件读取

- **WHEN** path 参数为具体文件路径(如 "cv.md", "config/profile.yml")
- **THEN** 工具调用 `/api/agent/read-file?path=...` 在服务端读取文件
- **AND** 服务端执行白名单校验(仅 .md/.yml/.json/.txt)
- **AND** 服务端执行 `isGarbledText()` 乱码检测
- **AND** 成功读取后截断到 2000 字符(`truncated: true`)
- **AND** errorCategory 为 "ok"

#### Scenario: 文件读取乱码

- **WHEN** 服务端读取文件后 `isGarbledText()` 返回 true
- **THEN** errorCategory 为 "permanent"
- **AND** 返回错误信息:"文件编码异常,无法读取"
- **AND** Agent Loop 直接降级,不重试

#### Scenario: 文件不存在

- **WHEN** path 指定的文件在项目目录中不存在
- **THEN** errorCategory 为 "permanent"
- **AND** 返回错误信息包含文件路径和建议

#### Scenario: 路径白名单拦截

- **WHEN** path 指向非白名单扩展名(.exe/.bin/.dat)或尝试路径遍历(../)
- **THEN** errorCategory 为 "permanent"
- **AND** 返回错误信息:"不支持的文件类型或路径"
