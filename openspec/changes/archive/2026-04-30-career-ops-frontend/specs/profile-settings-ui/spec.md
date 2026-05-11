# Spec: Profile Settings UI

## ADDED Requirements

### Requirement: 个人信息编辑

用户可以编辑和管理个人档案信息。

#### Scenario: 编辑基本信息

- **WHEN** 用户打开设置页面
- **THEN** 显示个人信息表单：姓名、邮箱、电话、城市、LinkedIn、GitHub、作品集
- **AND** 修改后自动保存到本地存储

#### Scenario: 职业定位编辑

- **WHEN** 用户编辑职业定位
- **THEN** 可以设置目标岗位、求职类型（primary/secondary/adjacent）
- **AND** 可以编辑职业叙事（headline, exit_story, superpowers）
- **AND** Superpowers 支持拖拽排序

#### Scenario: 薪资设置

- **WHEN** 用户编辑薪资期望
- **THEN** 显示中国市场薪资设置：税前月薪范围（K）、最低接受薪资、薪资灵活性
- **AND** 可以设置福利偏好：五险一金缴纳要求、公积金比例、年终奖期望

### Requirement: 应用偏好

用户可以设置应用级别的偏好。

#### Scenario: 语言切换

- **WHEN** 用户切换界面语言
- **THEN** 支持中文和英文两种界面语言
- **AND** 切换即时生效

#### Scenario: 主题切换

- **WHEN** 用户切换主题
- **THEN** 支持浅色（默认）和深色两种模式
- **AND** 深色模式下保持温暖的调性（非冷色调 Dark Mode）

#### Scenario: 动效设置

- **WHEN** 用户在设置中调整动效
- **THEN** 可以选择：完整动画 / 减少动画 / 无动画
- **AND** 默认跟随系统 prefers-reduced-motion

### Requirement: 数据管理

用户可以管理本地存储的数据。

#### Scenario: 数据导出

- **WHEN** 用户点击"导出全部数据"
- **THEN** 下载包含所有数据的 ZIP 文件
- **AND** 文件结构与 CLI 系统兼容（applications.md + reports/ + profile.yml）

#### Scenario: 数据导入

- **WHEN** 用户从 CLI 系统导入数据
- **THEN** 上传的 ZIP 被解析并与现有数据合并
- **AND** 重复项自动去重

#### Scenario: 清除数据

- **WHEN** 用户点击"清除所有数据"
- **THEN** 二次确认（防止误操作）
- **AND** 确认后清除所有本地数据
