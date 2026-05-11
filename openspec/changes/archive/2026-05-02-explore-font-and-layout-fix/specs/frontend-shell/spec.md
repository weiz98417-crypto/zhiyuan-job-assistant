# Spec: Frontend Shell

## MODIFIED Requirements

### Requirement: App Shell Layout

应用必须提供一个统一的 App Shell，包含导航和内容区域，让用户感觉在翻一本个人手帐而非操作一个工具。内容区域必须传递完整高度给子页面。

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

#### Scenario: 内容区高度传递

- **WHEN** 子页面使用 flex-1 填充可用高度（如固定底部输入框的聊天布局）
- **THEN** AppShell 内容包裹层传递完整高度（h-full flex flex-col）
- **AND** 子页面的 flex-1 元素可正确填满到页面底部
