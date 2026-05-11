# Spec: Frontend Shell

## ADDED Requirements

### Requirement: App Shell Layout

应用必须提供一个统一的 App Shell，包含导航和内容区域，让用户感觉在翻一本个人手帐而非操作一个工具。

#### Scenario: 首次访问看到首页

- **WHEN** 用户首次访问应用
- **THEN** 显示"今日手帐"首页，包含温暖的欢迎语和当日求职概览
- **AND** 左侧或底部显示主导航

#### Scenario: 导航切换页面

- **WHEN** 用户点击导航中的任意菜单项
- **THEN** 页面内容以翻页般的过渡动画切换到目标页面
- **AND** 当前页面的导航项以暖色高亮

#### Scenario: 移动端适配

- **WHEN** 用户在手机屏幕上访问应用
- **THEN** 导航自动切换为底部 Tab Bar 模式
- **AND** 所有页面内容在窄屏幕上可读

### Requirement: Design System

应用必须实现 DESIGN.md 定义的设计系统，包括色彩、字体、圆角、动画等所有 token。

#### Scenario: 色彩一致性

- **WHEN** 检查应用的任意页面
- **THEN** 所有颜色来自 OKLCH 色彩空间
- **AND** 不出现纯白 (#fff) 或纯黑 (#000)
- **AND** Warm Amber Glow 占界面 30-50% 的色彩面积

#### Scenario: 字体层级

- **WHEN** 渲染任意包含标题和正文的页面
- **THEN** Display 文字使用圆体/手写感字体
- **AND** Body 文字使用人文无衬线字体
- **AND** 两者之间有明显的个性落差（The Handwriting Gap Rule）

#### Scenario: 动效可访问性

- **WHEN** 用户在系统中开启了 reduced motion 偏好
- **THEN** 入场动画被禁用，所有过渡为即时切换
- **AND** 翻页效果被替换为简单的淡入

### Requirement: Local-First Data

应用必须支持本地数据存储，用户数据默认保存在浏览器中，无需后端服务即可使用全部功能。

#### Scenario: 数据持久化

- **WHEN** 用户完成一次 JD 评估并关闭浏览器
- **THEN** 重新打开应用后，评估报告依然存在
- **AND** 投递追踪数据完整保留

#### Scenario: 数据导出

- **WHEN** 用户点击"导出数据"
- **THEN** 所有本地数据打包为 ZIP 下载（含 applications.md、reports/、profile.yml）
- **AND** 格式与 CLI 系统兼容

#### Scenario: 数据导入

- **WHEN** 用户从 CLI 系统导出数据并在前端导入
- **THEN** applications.md 被解析并填充到投递追踪
- **AND** reports/ 目录下的报告被导入并关联到对应应用
