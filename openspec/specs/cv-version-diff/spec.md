# Spec: CV Version Diff

## Purpose

Provide side-by-side comparison of two CV versions with diff highlighting, change statistics, and in-view operations.

## ADDED Requirements

### Requirement: 简历版本并排对比

系统 SHALL 提供同份简历两个版本的左右并排 diff 视图，高亮差异并统计变更。

#### Scenario: 选择版本对比

- **WHEN** 用户在版本选择器中点击"对比"按钮
- **THEN** 系统 SHALL 展示左右两栏对比视图
- **AND** 左侧标注为旧版本名称，右侧标注为新版本名称
- **AND** 用户可通过下拉框切换参与对比的版本

#### Scenario: 逐行差异高亮

- **WHEN** 两个版本的内容存在差异
- **THEN** 系统 SHALL 按 section 对齐，逐行对比
- **AND** 新增行显示绿色背景 + "+" 前缀
- **AND** 删除行显示红色背景 + "-" 前缀
- **AND** 相同行无背景色
- **AND** 仅在修改过的 section 上标注差异（未修改 section 折叠显示）

#### Scenario: 变更统计摘要

- **WHEN** 对比完成
- **THEN** 底部 SHALL 显示变更统计
- **AND** 统计包含：新增句子数、删除句子数、量化表述变化（+N/-M）、关键词覆盖变化
- **AND** 统计信息使用简洁的 badge/pill 展示

#### Scenario: 无差异情况

- **WHEN** 两个版本完全相同
- **THEN** 系统 SHALL 显示"两个版本内容一致"

#### Scenario: 返回编辑

- **WHEN** 用户点击"返回编辑"
- **THEN** 系统 SHALL 关闭对比视图，回到编辑器
- **AND** 当前编辑的版本不变

### Requirement: 对比视图中的操作

用户 SHALL 可以在对比视图中执行版本操作。

#### Scenario: 从对比视图复制内容

- **WHEN** 用户在对比视图中选中某行文本
- **THEN** 系统 SHALL 允许复制到剪贴板
- **AND** 提供"将此版本设为当前"按钮

#### Scenario: 对比中删除版本

- **WHEN** 用户在对比视图中删除某个版本
- **THEN** 系统 SHALL 关闭对比视图
- **AND** 如果只剩一个版本则隐藏对比按钮
