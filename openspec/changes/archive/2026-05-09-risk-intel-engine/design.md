## Context

筝筝纸鸢已具备正向 JD 评估能力（A-G 7 维度评分）。缺失的是反向风险检测——判断岗位本身有没有问题。在 office-hours 中，用户指出中国求职市场特有的隐性风险：虚假招聘、黑话包装、骗术模式等。

## Goals / Non-Goals

**Goals:**
- 建立可生长的风险情报知识库
- 实现两层风险检测（字面 + 语义）
- 将风险信号纳入评分系统

**Non-Goals:**
- 不在此 change 中做外部数据采集（脉脉/看准网爬取）——属于后续迭代
- 不改变现有 A-F 评分维度

## Decisions

### Decision 1: risk-intel.md 采用 YAML schema 存储

五个顶层 key：`terms`、`patterns`、`employment_types`、`company_risks`、`salary_benchmarks`。每个分类有独立的字段 schema。

### Decision 2: 两层匹配机制

**字面匹配：** `scan-risks.mjs` 读取 `risk-intel-triggers.yml`，对 JD 文本执行正则匹配。确定性，零 LLM 调用，零误判。输出 JSON `[{signal, excerpt, severity}]`。

**语义匹配：** LLM 收到字面匹配结果作为"已知信号"，然后搜索未覆盖的语义变体。LLM 禁止重复标记已知信号。

**Company risks 精确匹配：** LLM 提取公司名 → 标准化 slug → 在 company_risks 列表中精确查找。不经过语义判断。

### Decision 3: 加权计分制

| 严重度 | 权重 | 示例 |
|--------|------|------|
| critical | 10 | 诈骗/传销 |
| high | 4 | 加班陷阱/合同陷阱 |
| medium | 2 | 用工形式/模糊承诺 |
| low | 1 | 措辞不规范 |

- 总分 = Σ(命中信号权重)
- 命中 critical → 直降 1.0/5
- 总分 ≥ 6 (无 critical) → 上限 min(原分, 2.5)
- 总分 2-5 → 评分不变，顶部加横幅

### Decision 4: 冷启动策略

- < 5 条记录 → 跳过风险模块
- 5-30 条 → 正常运行但标注"建设中"
- ≥ 30 条 → 完整运行

## Risks / Trade-offs

- **[R] 知识库初始为空** → 用户需手动种子 10 条(黑话+骗术模式)。冷启动期间风险检测不可用。
- **[R] 误报** → 提供误报反馈机制("误报: [信号名]")，同公司自动降级。目标误报率 < 20%。

## Migration Plan

1. 创建 `modes/zh/risk-intel.md` (初始种子数据)
2. 创建 `risk-intel-triggers.yml` (初始 5+ 条正则)
3. 创建 `scripts/scan-risks.mjs`
4. 更新 `modes/zh/jianzhi.md` → 增加风险检测步骤
5. 更新 `modes/zh/_shared.md` → 增加风险权重
6. 端到端测试：JD → scan-risks → LLM supplement → 风险表格 → 评分降级
