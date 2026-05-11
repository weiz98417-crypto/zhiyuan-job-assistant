# Spec: JD Library UI

## ADDED Requirements

### Requirement: JD 卡片列表

系统 SHALL 在 `/evaluate/jds` 路由下以卡片列表形式展示所有已录入的 JD，每张卡片显示：公司名（粗体）、职位名、来源类型图标（paste/ocr/url）、正文前200字截断预览、录入时间、是否有关联报告标识。

#### Scenario: 空库状态

- **WHEN** 用户首次进入 JD 库页面且无任何 JD 记录
- **THEN** 显示温暖的空白提示："还没有 JD 记录，去评估一个职位吧"
- **AND** 提供跳转到评估页面的快捷按钮

#### Scenario: 有 JD 记录时的列表

- **WHEN** JD 库中有记录
- **THEN** 以卡片网格布局（2列 desktop / 1列 mobile）展示所有 JD
- **AND** 按 `createdAt` 降序排列（最新在前）
- **AND** 每张卡片显示截断正文（前200字 + "..."）

#### Scenario: 点击卡片查看详情

- **WHEN** 用户点击某张 JD 卡片
- **THEN** 弹出详情面板或跳转到详情视图
- **AND** 显示完整 JD 正文、公司、职位、来源、关联报告链接

### Requirement: JD 搜索

系统 SHALL 提供搜索框，支持实时过滤 JD 卡片列表，匹配范围为 `company`、`role`、`body` 字段。

#### Scenario: 按公司名搜索

- **WHEN** 用户输入公司名关键词
- **THEN** 实时过滤显示匹配的 JD 卡片
- **AND** 搜索大小写不敏感

#### Scenario: 按职位关键词搜索

- **WHEN** 用户输入职位关键词（如"前端"、"后端"、"产品"）
- **THEN** 实时过滤显示职位名或正文中包含该关键词的 JD 卡片

#### Scenario: 无匹配结果

- **WHEN** 搜索关键词无任何匹配
- **THEN** 显示"没有找到匹配的 JD"

### Requirement: JD 筛选

系统 SHALL 提供按来源类型和报告关联状态的筛选选项。

#### Scenario: 按来源类型筛选

- **WHEN** 用户选择筛选"OCR 识别"
- **THEN** 仅显示 `sourceType === "ocr"` 的 JD 卡片

#### Scenario: 筛选有报告的 JD

- **WHEN** 用户选择筛选"已有评估报告"
- **THEN** 仅显示 `reportId` 不为空的 JD 卡片

#### Scenario: 清除筛选

- **WHEN** 用户点击"清除筛选"
- **THEN** 恢复显示全部 JD 卡片

### Requirement: JD 编辑与删除

系统 SHALL 支持从详情面板编辑 JD 的公司名、职位名、正文，以及删除 JD 记录。

#### Scenario: 编辑 JD 信息

- **WHEN** 用户在详情面板修改公司名并保存
- **THEN** 更新 `jds` 表中对应记录
- **AND** 卡片列表立即反映更改

#### Scenario: 删除 JD 确认

- **WHEN** 用户点击删除 JD
- **THEN** 弹出确认对话框："确定删除该 JD 记录？关联的报告不受影响"
- **AND** 确认后删除 JD 记录并从列表移除
- **AND** 拒绝后不做任何操作

### Requirement: 从评估结果保存到 JD 库

评估报告页 SHALL 提供"保存到 JD 库"按钮，点击后将当前 JD 写入 JD 库。

#### Scenario: 评估报告页显示保存按钮

- **WHEN** 用户查看评估报告
- **THEN** 在报告操作区显示"保存到 JD 库"按钮
- **AND** 若已保存过则按钮显示为"已保存到 JD 库"（disabled 状态）

#### Scenario: 保存成功

- **WHEN** 用户点击"保存到 JD 库"
- **AND** JD 数据完整（有 company 和 role）
- **THEN** JD 写入 `jds` 表，关联当前报告
- **AND** 按钮变为"已保存到 JD 库"

#### Scenario: 保存失败提示

- **WHEN** 保存到 JD 库时发生错误（如 IndexedDB 写入失败）
- **THEN** 显示错误提示并保留按钮可用状态以便重试
