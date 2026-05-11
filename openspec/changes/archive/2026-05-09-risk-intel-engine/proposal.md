## Why

中国求职市场存在大量隐性风险：虚假招聘（"招小可爱"实为诈骗）、黑话包装（"亲自带"=007无偿加班）、外包伪装本部、薪资注水、培训贷骗局等。当前筝筝纸鸢的 JD 评估只做正向匹配（"你适不适合这个岗位"），完全缺少反向检测（"这个岗位本身有没有问题"）。

用户在 office-hours 中明确指出：中国求职市场"水很深"——"招小可爱（其实是骗）""亲自带（招黑奴）"这类行业黑话和骗术模式，在网上广泛讨论但从未被产品化解决。这是一个真实的产品缺口。

## What Changes

- **新增** `modes/zh/risk-intel.md` — 风险情报知识库：黑话词典、骗术模式、用工形式矩阵、薪资基准、公司风险信号
- **新增** `risk-intel-triggers.yml` — 字面匹配触发词正则，供确定性扫描使用
- **新增** `scripts/scan-risks.mjs` — 两层匹配引擎：字面正则 + LLM 语义补充
- 修改 `modes/zh/jianzhi.md` — 评估流程增加风险检测步骤
- 修改 `modes/zh/_shared.md` — 评分引擎增加风险权重（加权计分制）

## Capabilities

### New Capabilities
- `risk-intel-knowledge-base`: 风险情报知识库——黑话词典、骗术模式、用工形式矩阵、薪资基准、公司风险信号，YAML schema 统一管理
- `risk-detection-engine`: 两层风险检测引擎——字面正则匹配（确定性）+ LLM 语义匹配（补充覆盖）
- `risk-weighted-scoring`: 风险加权评分——信号严重度权重 + 总分制 + critical 信号直降为 1.0

## Impact

- `modes/zh/risk-intel.md`: 新文件，用户手动种子 + Agent 持续增长
- `risk-intel-triggers.yml`: 新文件，字面匹配正则模式
- `scripts/scan-risks.mjs`: 新文件，确定性扫描脚本
- `modes/zh/jianzhi.md`: 评估流程插风险检测步骤
- `modes/zh/_shared.md`: 评分引擎加风险权重逻辑
