## ADDED Requirements

### Requirement: CV 版本数据结构

系统 SHALL 将 CV 数据以版本化结构存储在 localStorage key `lingji-ai-cv` 中，包含活跃版本标识和版本字典。

#### Scenario: 新用户首次创建

- **WHEN** 用户首次打开 CV 页面且 localStorage 中不存在 `lingji-ai-cv`
- **THEN** 系统创建一个默认版本 `v1`，label 为「初始版本」，sections 为 5 个空 section
- **AND** 将 `activeVersion` 设为 `"v1"`
- **AND** `source` 标记为 `"manual"`

#### Scenario: 旧数据迁移

- **WHEN** localStorage 中 `lingji-ai-cv` 的值为扁平的 `CVSection[]` 数组（旧格式）
- **THEN** 系统自动将其包装为版本化结构，版本 id 为 `"v1"`，label 为「初始版本」
- **AND** 写回 localStorage 覆盖旧数据
- **AND** 页面正常渲染该版本的内容

### Requirement: 版本 CRUD 操作

系统 SHALL 支持创建、切换、重命名、删除 CV 版本。

#### Scenario: 创建新版本

- **WHEN** 用户点击「+ 新建版本」并输入版本名称
- **THEN** 系统基于当前活跃版本的 sections 创建副本
- **AND** 新版本使用自增 id（v2, v3, ...），`source` 为 `"manual"`
- **AND** 自动切换到新版本
- **AND** 版本名称不能为空

#### Scenario: 切换版本

- **WHEN** 用户在版本下拉菜单中选择另一个版本
- **THEN** 所有 section 编辑区内容替换为该版本的 sections
- **AND** `activeVersion` 更新为所选版本 id
- **AND** 写回 localStorage

#### Scenario: 切换前有未保存更改

- **WHEN** 用户当前版本有未保存的编辑内容，尝试切换到另一个版本
- **THEN** 弹出确认对话框：「当前版本有未保存的更改，是否放弃？」
- **AND** 用户确认后切换并丢弃更改
- **AND** 用户取消后留在当前版本

#### Scenario: 重命名版本

- **WHEN** 用户在版本下拉菜单中点击重命名并输入新名称
- **THEN** 该版本的 `label` 更新为新名称
- **AND** 写回 localStorage

#### Scenario: 删除版本

- **WHEN** 用户点击删除非活跃版本
- **THEN** 该版本从 `versions` 字典中移除
- **AND** 如果删除的是活跃版本，自动切换到剩余版本中最近创建的那个
- **AND** 写回 localStorage

#### Scenario: 至少保留一个版本

- **WHEN** 只剩一个版本时
- **THEN** 该版本的删除按钮不显示或置灰

### Requirement: 显式保存

系统 SHALL 采用手动保存模式，用户编辑后需点击「保存」按钮才会持久化更改。

#### Scenario: 编辑后保存按钮激活

- **WHEN** 用户修改任意 section 的文本内容
- **THEN** 「保存」按钮从灰色变为可点击的主色
- **AND** 按钮可显示文字提示如「保存」（或「有未保存更改 · 保存」）

#### Scenario: 点击保存

- **WHEN** 用户点击「保存」按钮
- **THEN** 当前版本的所有 sections 写入 localStorage
- **AND** 「保存」按钮恢复灰色状态
- **AND** 显示短暂的成功提示（如绿色勾 + 「已保存」）

#### Scenario: 无更改时按钮状态

- **WHEN** 页面刚加载或刚保存完成，用户未做任何修改
- **THEN** 「保存」按钮保持灰色/非激活状态
