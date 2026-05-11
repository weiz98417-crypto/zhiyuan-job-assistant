## ADDED Requirements

### Requirement: 技能缺口识别

系统 SHALL 列出 JD 要求但用户简历缺失的技能，每条标注：

- 技能名称
- 重要程度：必需 / 加分
- 可替代性评估：可用用户已有技能替代 / 需要学习

#### Scenario: 有明确技能缺口

- **WHEN** JD 要求 Kubernetes 经验但用户简历未提及
- **THEN** 系统输出 `{ skill: "Kubernetes", importance: "必需", substitution: "可用 Docker 经验解释学习意愿" }` 或 `{ skill: "Kubernetes", importance: "必需", substitution: "不可替代" }`

#### Scenario: 无明显缺口

- **WHEN** JD 要求的技能用户简历均覆盖
- **THEN** 系统返回空数组或提示"你的技能与该 JD 要求高度吻合"

### Requirement: 技能缺口 UI 展示

前端 SHALL 以表格形式展示技能缺口，包含技能名称、重要程度标签（必需/加分）、可替代性说明，按重要程度排序（必需项优先）。

#### Scenario: 有缺口的报告展示

- **WHEN** 评估报告包含技能缺口数据
- **THEN** 报告页面在关键词覆盖率下方展示"技能缺口"表格
