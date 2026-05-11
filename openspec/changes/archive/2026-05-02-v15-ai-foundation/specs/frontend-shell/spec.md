# Spec: Frontend Shell

## MODIFIED Requirements

### Requirement: App Shell Layout

应用必须提供一个统一的 App Shell，包含导航和内容区域，首页"今日手帳"展示 AI 每日摘要。

#### Scenario: 首次访问看到首页

- **WHEN** 用户首次访问应用
- **THEN** 显示"今日手帳"首页，包含温暖的欢迎语和当日求职概览
- **AND** 展示 AI 每日摘要卡片（投递统计、最近评估、跟进提醒、Pipeline 健康灯）
- **AND** 左侧或底部显示主导航

#### Scenario: AI 摘要卡片交互

- **WHEN** 用户点击 AI 摘要卡片中的任意模块
- **THEN** 跳转到对应详情页（投递统计→analytics，最近评估→evaluate，跟进→tracker）

#### Scenario: 无数据时的摘要

- **WHEN** 用户尚无任何求职数据
- **THEN** AI 摘要卡片显示引导文案："开始你的求职之旅吧——去探索页和 AI 聊聊，或者评估你的第一个 JD"
- **AND** 提供跳转到 explore 和 evaluate 的快捷按钮

#### Scenario: 导航切换页面

- **WHEN** 用户点击导航中的任意菜单项
- **THEN** 页面内容以翻页般的过渡动画切换到目标页面
- **AND** 当前页面的导航项以暖色高亮

#### Scenario: 移动端适配

- **WHEN** 用户在手机屏幕上访问应用
- **THEN** 导航自动切换为底部 Tab Bar 模式
- **AND** 所有页面内容在窄屏幕上可读
