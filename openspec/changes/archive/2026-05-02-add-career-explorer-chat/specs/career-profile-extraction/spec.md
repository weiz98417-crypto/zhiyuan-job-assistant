## ADDED Requirements

### Requirement: 对话归纳提取
`/api/chat/summarize` SHALL 从完整对话历史中提取结构化求职画像 JSON。

#### Scenario: 成功提取
- **WHEN** API 收到包含完整对话历史的 messages 数组
- **THEN** 返回结构化 JSON：
  - `targetRoles`: 推荐目标岗位列表（含 title / confidence / reasoning）
  - `skills`: 技能清单（core / secondary / advantage）
  - `preferences`: 工作偏好（companyType / industry / culture）
  - `constraints`: 硬约束（salary / location / hours / other）
  - `narrative`: 一段自然的求职叙事文案
  - `archetype`: 匹配的 archetype 类型

#### Scenario: 对话信息不足
- **WHEN** 对话历史过短（少于 3 轮用户回复）导致无法提取有效信息
- **THEN** 返回 400 错误，提示"对话信息不足，请再多聊几句"

#### Scenario: JSON 解析容错
- **WHEN** AI 返回的内容不是纯 JSON（被 markdown 代码块包裹等）
- **THEN** 系统用正则提取 ```json``` 代码块内容再解析
- **AND** 提取失败时返回 500 错误并包含原始内容片段

### Requirement: 侧边栏画像展示
聊天页面侧边栏 SHALL 在用户触发归纳后展示提取的求职画像。

#### Scenario: 触发归纳
- **WHEN** 用户点击"帮我总结"按钮
- **THEN** 按钮进入 loading 状态
- **AND** 调用 `/api/chat/summarize` 传入完整对话历史
- **AND** 成功后侧边栏滑入展示画像

#### Scenario: 画像卡片展示
- **WHEN** 归纳提取成功
- **THEN** 侧边栏展示：
  - 推荐方向（含置信度百分比和理由）
  - 技能清单（分核心/次要/优势）
  - 工作偏好与硬约束
  - 求职叙事文案
  - "保存到档案"按钮

#### Scenario: 关闭侧边栏继续聊天
- **WHEN** 用户查看画像后关闭侧边栏
- **THEN** 侧边栏收起，聊天区恢复全宽
- **AND** 用户可继续聊天并再次触发归纳更新

### Requirement: 画像持久化
用户 SHALL 可以将归纳结果一键写入 `config/profile.yml` 和 `modes/_profile.md`。

#### Scenario: 保存到档案
- **WHEN** 用户点击侧边栏中的"保存到档案"按钮
- **THEN** 调用 `/api/data/import`（已有端点）将画像数据写入配置文件
- **AND** 按钮变为"已保存"状态
- **AND** 保存后导航栏及其他模块可立即感知最新的用户画像

#### Scenario: 部分覆盖
- **WHEN** profile.yml 中已有部分字段
- **THEN** 新提取的字段覆盖旧值
- **AND** 已存在但新提取中为空的字段保留原值不被清空
