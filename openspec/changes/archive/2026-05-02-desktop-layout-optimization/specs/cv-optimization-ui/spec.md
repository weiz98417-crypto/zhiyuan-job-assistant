## MODIFIED Requirements

### Requirement: 简历基础信息

用户可以编辑和管理个人简历的基础内容。

#### Scenario: 编辑简历内容

- **WHEN** 用户打开简历优化页面
- **THEN** 显示当前简历的编辑界面（Summary、工作经历、项目、教育、技能）
- **AND** 支持 Markdown 编辑
- **AND** 自动从 cv.md 加载初始内容

#### Scenario: 多版本简历管理

- **WHEN** 用户保存针对不同岗位的简历版本
- **THEN** 每个版本关联到目标岗位和 JD
- **AND** 可以查看版本差异

#### Scenario: 桌面大屏编辑布局

- **WHEN** 用户在 ≥1280px 屏幕访问简历管理页
- **THEN** 页面使用 `grid-cols-[1fr_360px]` 布局：左侧编辑区占剩余空间，右侧 JD 配对面板固定 360px
- **AND** 编辑区 textarea 宽度自适应，不再受窄列限制
- **AND** 右侧 JD 配对面板始终可见，方便对照优化
