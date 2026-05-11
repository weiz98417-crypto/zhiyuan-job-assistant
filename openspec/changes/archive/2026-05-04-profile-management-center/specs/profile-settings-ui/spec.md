## MODIFIED Requirements

### Requirement: 画像页面为管理中心

/profile 页面 SHALL 从被动展示改为主动管理中心。用户 SHALL 能直接在页面上管理目标岗位、核心技能、偏好设置，而非仅阅读 Agent 生成的画像。

#### Scenario: 每个卡片有编辑入口

- **WHEN** 用户访问 /profile 页面
- **THEN** 目标岗位卡片、核心技能卡片、偏好设置卡片右上角 SHALL 显示编辑按钮（铅笔图标）
- **AND** 只读卡片（技能雷达、技能缺口、进化轨迹）SHALL 不显示编辑按钮

#### Scenario: 锁定状态可视

- **WHEN** 画像中某些字段 source 为 "manual"
- **THEN** 对应卡片区域 SHALL 显示锁定标记
- **AND** 用户能明确知道哪些数据被保护不会被 AI 覆盖

#### Scenario: 数据操作区

- **WHEN** 用户滚动到 /profile 页面底部
- **THEN** 页面 SHALL 显示数据操作区
- **AND** 操作区包含：「从服务器同步最新数据」按钮、「导出画像 JSON」按钮、「重置画像」按钮（红色，需二次确认）

### Requirement: 同步按钮

「从服务器同步」按钮 SHALL 强制从 SQLite 拉取最新画像数据并同步到前端 DexieDB 缓存。

#### Scenario: 手动同步

- **WHEN** 用户点击「从服务器同步最新数据」按钮
- **THEN** 系统 SHALL 调用 GET `/api/data/profile` 获取最新数据
- **AND** SHALL 同步到 DexieDB 缓存
- **AND** 页面 SHALL 刷新显示最新数据
- **AND** 显示同步成功 toast

### Requirement: 导出画像

「导出画像 JSON」按钮 SHALL 将当前画像数据导出为 JSON 文件下载。

#### Scenario: 导出 JSON

- **WHEN** 用户点击「导出画像 JSON」按钮
- **THEN** 浏览器 SHALL 下载 `zhiyuan-profile-YYYY-MM-DD.json` 文件
- **AND** 文件包含完整的 ZhiyuanProfile 数据（skills、preferences、marketFit、goals、history）

### Requirement: 重置画像

「重置画像」按钮 SHALL 在二次确认后清空所有画像数据。

#### Scenario: 重置确认

- **WHEN** 用户点击「重置画像」按钮
- **THEN** 系统 SHALL 弹出二次确认对话框：「确定要重置画像吗？所有目标、技能、偏好数据将被清空，此操作不可撤销」
- **AND** 用户确认后 SHALL 调用 DELETE 清空 profiles 表中的 data/goals/history
- **AND** 页面 SHALL 回到初始空白状态
