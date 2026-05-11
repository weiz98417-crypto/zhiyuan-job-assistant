## Why

英文模式 (`modes/_shared.md`) 和中文模式 (`modes/zh/_shared.md`) 各自独立定义了评分维度结构。英文有 6 个评分块 (A-F)，中文有 7 个 (A-G)。同一份 JD 用不同语言评估会得到不同维度的覆盖和不同算法得出的总分。"发布合法性"评估在 `oferta.md` 块 G 和 `_shared.md` 中分别定义，修复一处不会修复另一处。

## What Changes

- 新建 `modes/scoring-dimensions.yml`：评分维度的唯一权威定义（块 ID、名称、权重、适用条件）
- `modes/_shared.md` 和 `modes/zh/_shared.md`：删除内联评分结构，改为引用 `scoring-dimensions.yml`
- 统一块数量（建议 7 块 A-G），中文模式的块 G（发布合法性）下沉到所有语言
- `modes/oferta.md`：删除重复的 G 块定义

## Capabilities

### New Capabilities
- `scoring-dimensions-config`: 评分维度从 mode 文件中抽离到 YAML 配置，单一权威源

### Modified Capabilities
<!-- 无 -->

## Impact

- `modes/scoring-dimensions.yml`: 新文件
- `modes/_shared.md`: 评分块定义替换为配置引用
- `modes/zh/_shared.md`: 同上
- `modes/oferta.md`: 删除重复的 G 块定义
- `modes/zh/jianzhi.md`: 适配统一后的块标签
