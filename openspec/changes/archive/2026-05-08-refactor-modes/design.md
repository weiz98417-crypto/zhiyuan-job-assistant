## Context

英文模式 (`modes/_shared.md`) 定义评分结构为 A-F 共 6 个块。中文模式 (`modes/zh/_shared.md`) 定义 A-G 共 7 个块（多了一个 G: 发布合法性）。两个文件各自内联了完整的评分维度定义（块名称、权重、评估要点）。`modes/oferta.md` 又独立声明了"A-G 7 块评估"，但英文 `_shared.md` 实际只有 6 块。

同一 JD 用不同语言评估会得到不同维度的覆盖和不同算法得出的总分。修复一个评分块需要同步修改 3 个文件。

## Goals / Non-Goals

**Goals:**
- 评分维度从 mode 文件中抽离到单一 YAML 配置
- 中英文块数量统一为 7（A-G）
- `oferta.md` 删除重复定义
- 语言差异仅保留在 prompt 措辞层面

**Non-Goals:**
- 不改变评分算法或权重（只统一结构，不调参）
- 不在此 change 中调整评分公式

## Decisions

### Decision: scoring-dimensions.yml 作为唯一评分结构定义

**选择：** 新建 `modes/scoring-dimensions.yml`，所有 mode 文件引用它。

文件结构：
```yaml
dimensions:
  - id: A
    key: role_summary
    label_zh: 岗位摘要与公司背景
    label_en: Role Summary & Company Context
    weight: 10
  - id: B
    key: cv_match
    label_zh: 简历匹配度
    label_en: CV Match
    weight: 20
  - id: C
    key: level_strategy
    label_zh: 级别定位与竞争策略
    label_en: Level & Strategy
    weight: 15
  - id: D
    key: compensation
    label_zh: 薪酬福利评估
    label_en: Compensation & Benefits
    weight: 15
  - id: E
    key: personalization
    label_zh: 个性化方案
    label_en: Personalization
    weight: 15
  - id: F
    key: interview_prep
    label_zh: 面试准备
    label_en: Interview Prep
    weight: 15
  - id: G
    key: legitimacy
    label_zh: 发布合法性与风险
    label_en: Posting Legitimacy & Risk
    weight: 10
```

**理由：** 块 G（发布合法性）对中国市场尤其重要（虚假招聘、皮包公司），下沉到全语言。

## Risks / Trade-offs

- **[R] scoring-dimensions.yml 被错误编辑** → YAML 格式错误会导致所有 mode 无法加载评分结构。
  → **缓解:** mode 文件中添加注释说明不手动编辑此文件，通过 Agent 批量更新。

## Migration Plan

1. 创建 `modes/scoring-dimensions.yml`
2. 更新 `modes/_shared.md`：删除内联评分块，替换为 `Read modes/scoring-dimensions.yml` 指令
3. 更新 `modes/zh/_shared.md`：同上，中文 prompt 使用 `label_zh` 字段
4. 更新 `modes/oferta.md`：删除"A-G 7 块"声明，引用 scoring-dimensions.yml
5. 验证：用同一 JD 跑中英文评估，确认评分维度一致
