## ADDED Requirements

### Requirement: 字段锁定标记

用户通过 /profile 页面手动修改的画像字段 SHALL 标记 `source: "manual"` 并持久化到 SQLite。Agent 自动更新和 Profile Engine 推断 SHALL 不覆盖已锁定字段。

#### Scenario: 手动编辑后锁定

- **WHEN** 用户通过 /profile 编辑表单保存了 goals、skills 或 preferences 的修改
- **THEN** 修改的字段 SHALL 在 data_json 或 goals_json 中标记 `source: "manual"` 和 `lockedAt: <timestamp>`
- **AND** 前端展示时该字段旁显示锁定指示器（小锁图标）

#### Scenario: Agent 更新跳过锁定字段

- **WHEN** Profile Engine 运行并尝试更新画像
- **THEN** 融合逻辑 SHALL 检查每个字段的 source 标记
- **AND** source 为 "manual" 的字段 SHALL 保持不变
- **AND** source 为 "auto" 或 "inferred" 的字段 SHALL 正常更新

#### Scenario: 用户手动解锁

- **WHEN** 用户在编辑表单中点击某锁定字段的解锁按钮
- **THEN** 该字段的 source SHALL 重置为 "auto"
- **AND** 下次 Agent 更新时可再次覆盖该字段

### Requirement: 锁定字段的可视化

/profile 页面上被锁定的字段 SHALL 有明确的视觉标识。

#### Scenario: 锁定图标显示

- **WHEN** 画像中某字段 source 为 "manual"
- **THEN** 该字段旁 SHALL 显示小锁图标（🔒）
- **AND** 鼠标悬停显示 tooltip「手动锁定，AI 不会自动修改。点击编辑可解锁」

### Requirement: 锁定状态 API 支持

/api/data/profile PATCH 端点 SHALL 支持在更新字段时写入 source 标记。

#### Scenario: PATCH 携带 source 标记

- **WHEN** 前端发送 PATCH 请求更新 goals
- **THEN** 请求 body SHALL 可携带 `source: "manual"` 和 `lockedAt` 字段
- **AND** 服务端 SHALL 将 source 标记持久化到对应的 JSON 字段中
