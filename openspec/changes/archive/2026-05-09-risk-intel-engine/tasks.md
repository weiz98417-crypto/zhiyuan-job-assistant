## 1. 风险情报知识库

- [x] 1.1 创建 `modes/zh/risk-intel.md` — 20条黑话词典 + 5种骗术模式 + 3种用工形式 + 5城市薪资基准
- [x] 1.2 填充初始种子数据：20 terms + 5 patterns + 3 employment_types + 5 salary_benchmarks
- [x] 1.3 创建 `risk-intel-triggers.yml` — 25条字面匹配正则模式（critical/high/medium/low）
- [x] 1.4 YAML 语法验证通过（js-yaml 解析成功）

## 2. 风险检测引擎

- [x] 2.1 创建 `scripts/scan-risks.mjs` — 读取 triggers.yml，正则匹配，JSON 输出
- [x] 2.2 支持 `--jd-text` 和 `--jd-file` 两种输入模式
- [x] 2.3 错误处理：triggers.yml 缺失 → `[]`；格式异常 → 警告 + `[]`
- [x] 2.4 测试通过：5信号JD → 正确输出；6 critical诈骗JD → 全命中；正常JD → `[]`

## 3. 集成评估流程

- [x] 3.1 更新 `modes/zh/jianzhi.md` — 第-1步插入风险检测（字面→公司精确→LLM语义→合并→分级）
- [x] 3.2 三层匹配流程：scan-risks.mjs → company slug lookup → LLM semantic supplement
- [x] 3.3 更新 `modes/zh/_shared.md` — 评分引擎增加风险加权引用
- [x] 3.4 结构化输出模板：🛡️ 风险提示表格 + 加权总分 + 综合等级 + 建议

## 4. 端到端验证

- [x] 4.1 测试用例："亲自带"+"弹性工作"+"薪资上不封顶"+"扁平化" → 5 signals → total=10 → 🔴高风险
- [x] 4.2 测试用例："招小可爱"+"培训贷"+"保录"+"零基础高薪" → 6 critical → 直降 1.0
- [x] 4.3 测试用例：字节跳动正常JD → `[]` → 正常评估（零误报）
- [x] 4.4 冷启动：risk-intel.md 已有 20+ 条目 → 正常运行
