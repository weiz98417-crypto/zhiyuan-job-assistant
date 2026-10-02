# 2026-10B 能力层深化 · Evals 与线上实测指引

对应 Spec 24-29（docs/agent-system-specs/），产出物分四层：**确定性 eval（vitest）**、**红队（promptfoo）**、**护栏脚本**、**线上实测清单**。评测形态参考 promptfoo 的声明式用例与 autoevals 的 rubric 评分器（两者均为 MIT，前者已引入，后者底稿已在 Spec 15 吸收）。

## 快速入口

```bash
npm run verify:capability-2026-10b   # 护栏 + 全部确定性 eval（一条命令）
npm run eval:redteam:build           # 打包红队被测模块（esbuild，随 vitest 提供）
npm run eval:redteam:core            # 红队核心集（确定性断言，PR CI 用，无 LLM 成本）
npm run eval:redteam                 # 红队全量（发布前；需 DEEPSEEK_API_KEY）
npm run seed:question-bank           # 题库种子导入（需 DATABASE_URL 指向 pgvector 库）
npm run gen:en-modes:translate       # 中文源变更后重生成英文镜像（人工过目 diff 后提交）
```

## 分 Spec 索引

| Spec | 能力 | 确定性 eval（vitest） | 红队/线上 |
| --- | --- | --- | --- |
| 24 事实校验 | 数字溯源硬门 + faithfulness 软门 + ATS 规则化 + PDF 反测 | `resume-factuality.eval.test.ts` | `promptfoo/`（注入/编造/PII 扫描）；线上=改简历流程看「数字溯源未通过」反馈与「仅供参考」降级提案 |
| 25 知识注册表 | 注册表/单源/死接线清理/环境混淆 | `knowledge-registry.test.ts` + 两个护栏脚本 | 线上=各 agent 提示词行为与迁移前一致 |
| 26 评分锚定 | 0-4 锚点+证据引用+veto+趋势延迟入账 | `interview-rubric-calibration.eval.test.ts`（30 样例±1 档，有 key 自动跑生产校准） | 线上=评分卡应显示「原文引用+三态」；无引用评分显示「本轮未评分」 |
| 27 题库引擎 | composeInterview 深接口+追问内容缺口+状态机单写者 | `question-bank.eval.test.ts` | 线上=`npm run seed:question-bank` 后出题应带出处标签；题目卡标注 `bank/jd/weakness/general` |
| 28 薪资基准 | 抽取正则+基准表+双条件聚合+D 板块溯源 | `outcome-salary.eval.test.ts` | 线上=JD 评估 D 板块应出现「静态参考（…）」或「实时聚合·N 条样本」来源标注 |
| 29 回流闭环 | 投递事件入账+拒信解析+故事册+prefFit | `outcome-salary.eval.test.ts` + `rejection-parsing.eval.test.ts` | 线上=对面试教练说「帮你拒信解析一下」→ 标签+引用+候选记忆；记忆管理里确认后激活 |

## 线上实测清单（建议顺序）

前置：生产库跑 `src/lib/postgres-schema.sql` 尾部新增段（四张新表 + scan_jobs 加列，全部 IF NOT EXISTS/ADD COLUMN IF NOT EXISTS，可重复执行）；`DEEPSEEK_API_KEY` 已配置。

1. **题库冷启动**：`npm run seed:question-bank` → 预期导入 76 题（4 岗位族）。想扩量：`npm run seed:question-bank -- --generate 20`（每族再生成 20 题，幂等）。
2. **面试教练全链路**：对面试教练发起模拟面试 → 验证①题目卡带出处标签②追问针对内容缺口（完整回答不再被强制追问）③评分卡有 0-4 档位+每维原文引用+三态判定④单场分数不再出现在记忆候选里。
3. **趋势入账**：同一弱项跨 3 场模拟面试后 → `interview_weakness_events` 出现记录 → 记忆治理页出现「面试趋势（≥3 场）」候选 → 确认后激活、可纠正可清除。
4. **改简历防编造**：让简历 agent 优化一段经历并诱导它写原文没有的数字 → 预期「数字溯源未通过（重试 1 次后仍失败），XX 保持原文未改动」或重试后通过；faithfulness 低分的方案标题带「仅供参考：」前缀。
5. **ATS 报告**：check_ats_compatibility → 联系方式/板块完整性/格式风险条目可复现（跑两次结果一致），量化/关键词两条来自 LLM。
6. **JD 评估 D 板块**：评估一个带薪资的 JD → D 板块引用薪资时带「静态参考（智联…）」标注；`salaryDataSource` 字段落在报告上。机会池攒够 30 条带薪岗位后再评估 → 标注变「实时聚合·N 条样本」。
7. **投递回流**：更新一条投递状态为「面试/offer/拒绝」→ 记忆账本出现 `application_outcome` 事件（即事实无需确认）；推荐接口在 <5 场面试样本时返回 `outcomeNote: 偏好匹配数据不足`，攒满 5 场后 prefFit 开始随真实反馈浮动。
8. **拒信回流**：对任一 agent 说「帮我解析这条拒信：<粘贴文本>」→ 返回封闭标签+原文引用+候选记忆 → 在记忆治理确认。
9. **故事册**：完成一场模拟面试（有 ≥3 档回答）→ 记忆候选出现 `interview_story` → 确认后面试教练提示「故事册中 N 条相关故事」。

## 已知边界（不是缺陷）

- SQLite 本地模式：题库/趋势/薪资聚合/拒信入账/事件入账全部 Postgres-only，SQLite 下显式跳过（2026-10-03 决策）。
- 机会池薪资聚合的存量数据不回填；上线初期静态 seed 是默认显示。
- 出题协议的完整问题地图（综合面 8 类/项目深挖 7 层）按 Spec 27 Out of Scope 留待题库有真实使用数据后迭代。
- 旧会话（无 durable 引擎状态）的 questionGraph 仍走消息重建路径；durable 会话已全部走纯投影（ADR-0044 的渐进迁移，按仓库「稳定后删除旧路径」纪律在后续版本收口）。

## 第一轮 code review 延后项（P1，有意识决策，非遗漏）

以下问题在 2026-10-03 第一轮 review 中识别；P0 全部修复，下列 P1 **有意延后**到后续列车，实施前勿当缺陷重报：

1. **生成链事实门**（P1-2）：`resume-generation-service` 尚未挂数字溯源（Spec 24「覆盖两条链」只完成了优化链）；生成链的产物以「从画像生成全新简历」为主、数字多来自画像本身，延后到 0.15.x 补丁。
2. **聚合岗位族/年限段维度**（P1-10/11）：薪资聚合暂按城市×通用族（family='general'）；`familyForRole` 已备好、聚合升维是纯 SQL 改动；正则 plausibility gate（2k-200k 之外丢弃、「10K QPS」误报）延后；risk-intel.md 的 46 条年薪限段数据仍在经 mode context 注入（与 seed 并存、语义不同层），合一待 modes 收口列车。
3. **旧投影路径删除**（P1-12）：`inferQuestionKind` 正则仍服务 legacy 会话（见上「已知边界」末条）。
4. **种子量与大厂差异化**（P1-14）：种子 76 题（spec 目标一级 150-200/族）——用 `npm run seed:question-bank -- --generate N` 扩量；13 家大厂差异化与 JD 评估 B 板块接 composeInterview 延后；10% 人工抽检记录待首批线上数据。
5. **D 板块估算的结构性强制**（P1-15）：来源标注已注入 prompt 但「估算不计入总分」暂无确定性校验用例——总分本就是 LLM 自报（既有架构），等 Spec 28 评估器收口时一起治。
6. **modes/ 全量迁注册表**（P2）：loadModeContext/agent-mode-service 等仍直读 modes 文件（行为等价）；注册表当前收口的是服务内嵌 prompt 与单源收敛，modes 全量搬家用「迁移不改语义」流程单独走。
7. ** coach overlay 的 cvText**（P2）：移除 localStorage 后 overlay 不再携带简历摘要（此前在服务端恒为空、行为等价）；如需注入走 session binding 参数，随面试 UI 迭代。
8. **投影节点 ID 不稳定**（P2）：每次投影生成新 ID；下游未持久化引用节点 ID，暂无消费者。
