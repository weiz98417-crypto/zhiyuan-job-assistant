## 1. 创建配置文件

- [x] 1.1 创建 `modes/scoring-dimensions.yml` — 7 个维度 A-G，总权重 100（已在 unify-data-layer 中完成）

## 2. 更新英文模式

- [x] 2.1 更新 `modes/_shared.md` — 内联评分块替换为 scoring-dimensions.yml 引用（已在 unify-data-layer 中完成）
- [x] 2.2 更新 `modes/oferta.md` — "A-G 7 blocks" 替换为 scoring-dimensions.yml 引用（已在 unify-data-layer 中完成）

## 3. 更新中文模式

- [x] 3.1 更新 `modes/zh/_shared.md` — 内联评分块替换为 scoring-dimensions.yml 引用（已在 unify-data-layer 中完成）
- [x] 3.2 `modes/zh/jianzhi.md` — 评估流程引用 scoring-dimensions.yml（已在 unify-data-layer 中完成）

## 4. 验证

- [x] 4.1 YAML 语法验证：7 dimensions, sum=100, OK
- [x] 4.2 权重总和 = 100
- [x] 4.3 无残留内联评分块定义（仅保留 Block G 内容描述）
