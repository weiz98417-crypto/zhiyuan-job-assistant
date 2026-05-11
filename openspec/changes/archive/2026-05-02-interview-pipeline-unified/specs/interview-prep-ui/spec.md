## MODIFIED Requirements

### Requirement: 面试问题生成

系统 SHALL 在 Pipeline 配置区提供 JD 选择、CV 加载、公司预设和题目生成功能，生成的题目在题目列表区展示，每道题可一键进入练习。

#### Scenario: JD 选择器从 JD 库加载

- **WHEN** 用户查看配置区的 JD 选择器
- **THEN** 下拉列表显示 `db.jds` 中的所有 JD 记录（公司+职位+日期）
- **AND** 默认选项为"通用出题（不限 JD）"

#### Scenario: 选中 JD 后传递正文

- **WHEN** 用户选中某个 JD 并点击"生成面试题目"
- **THEN** 系统读取该 JD 的 `body` 字段作为 `jdText` 传递给 API
- **AND** 同时读取选中 JD 的 `company` 和 `role` 字段

#### Scenario: CV 自动加载

- **WHEN** 出题 API 被调用时
- **THEN** 系统调用 `getCVFullText()` 读取简历全文作为 `cvText` 传递给 API
- **AND** 如果简历为空，传递空字符串，API 进入通用出题模式

#### Scenario: CV 状态指示

- **WHEN** 用户查看配置区
- **THEN** 显示简历加载状态：已加载（绿色标签"简历已就绪"）/ 为空（灰色标签"未找到简历，将通用出题"）

#### Scenario: 生成题目后展示在题目列表

- **WHEN** API 返回生成的题目
- **THEN** 题目以卡片网格形式展示在配置区下方的题目列表区
- **AND** 顶部显示进度统计（"已练习 0/8 题"）
- **AND** 每张卡片展示：分类标签、题目文本、考察意图、准备提示

#### Scenario: 通用出题模式

- **WHEN** 用户未选择 JD（选择"通用出题"）
- **THEN** 系统仅传递公司预设风格和简历全文
- **AND** API 回退到通用出题策略
- **AND** 题目注明来源为 `general`

### Requirement: 面试准备 Pipeline 布局

面试准备页 SHALL 使用单页 Pipeline 布局，替代原有的三 Tab 架构。

#### Scenario: Pipeline 区域展示

- **WHEN** 用户打开面试准备页
- **THEN** 页面按顺序展示：配置区 → 题目列表区 → 已练列表区
- **AND** 配置区包含 JD 选择器、CV 状态、公司预设、生成按钮
- **AND** 已练列表默认折叠

#### Scenario: 练习面板替换题目列表

- **WHEN** 用户点击题目卡片上的 [练习] 按钮
- **THEN** 题目列表区替换为练习对话面板
- **AND** 面板顶部显示返回按钮和当前题目信息
- **AND** 对话区域加载教练流式对话组件

## REMOVED Requirements

### Requirement: 教练多轮对话 UI（独立 Tab）

**Reason**: 教练对话不再作为独立 Tab 存在，而是作为 Pipeline 中的内联练习面板，与题目上下文紧密耦合。
**Migration**: 教练对话 UI 组件迁移到 PracticePanel 内联组件，功能保留（流式对话、追问点击、多轮交互）。

### Requirement: STAR+R 故事库（独立 Tab）

**Reason**: 题库不再作为独立 Tab，而是作为 Pipeline 底部的已练列表区，与练习记录混合展示。
**Migration**: 故事数据保留在 `db.stories`，题库区域展示练习记录 + 手动故事统一视图。

### Requirement: 公司研究

**Reason**: 面试准备页聚焦于题目→练习→保存的 Pipeline，公司研究功能保留但移至独立入口或 future phase。
**Migration**: 公司研究相关状态和逻辑保留在代码中，Phase 2 重新接入。
