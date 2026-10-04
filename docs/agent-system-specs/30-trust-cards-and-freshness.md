# Spec 30: Trust Cards, Data Freshness, And Perception Metrics

**Target label:** `ready-for-agent`  
**Depends on:** Spec 26/28/29 的既有字段、CEO 审查 2026-10-04、`/api/memory/candidates` PATCH 既有端点；批次归属 0.19.0 · i-trust-cards（单列车，方案 a 含投影扩展；v2 按实现前审查修订——E1-E5/M1-M8 全部吸收）

## Problem Statement

CEO 审查结论：能力层七列车建成的价值有四块没有递到用户手里——①评分证据（0-4 档位、逐维原文引用、三态判定）后端全有，但工具卡与复盘页仍只渲染 `X/5`，且 **rubric 字段在安全投影白名单之外**（surface-projection.ts 的 interview_score 白名单只有 sessionId/score/feedback/dimensions/readBackVerified，bands/evidence/states/review 全被 sanitize 剥掉），复盘页对 durable 会话**没有数据送达路径**（客户端 parseServerSession 要求 planSnapshot，durable 引擎形状被全部过滤；投影函数唯一调用方算完即丢）；②拒信解析卡片被投影层**整卡静默**（rejection_parse 不在 SAFE_PAYLOAD_TYPES，实时路径 continue、回放路径整条消息隐藏）；③静态薪资 seed 数据截至 2025-06，超时效后仍以权威口吻展示；④没有任何「用户是否感知到差异」的度量。另：未评分兜底缺可行动反馈。

## Solution

五个工作面一次交付（方案 a）：**投影白名单与读路径**（前置打通数据通路）→ **投影扩展**（rubric 细节持久化）→ **前端信任卡**（工具卡新增分支+复盘页，档位/锚定词/证据/三态，统一双刻度）→ **数据保鲜** → **感知指标**（含客户端写路由）。拒信确认走既有 `/api/memory/candidates` PATCH。

## User Stories

（同 v1：评分依据可见 / 拦截修复被感知 / 聊天内拒信确认 / 薪资时效透明 / 产品方可回答感知问题 / 未评分有可行动反馈。）

## Implementation Decisions

### WP0 数据通路（v2 新增，一切前端工作的前置）
- **投影白名单扩展**（surface-projection.ts）：
  - `SAFE_PAYLOAD_TYPES` 增加 `rejection_parse`；`TOOL_LABELS` 增加 `log_rejection_notice: "拒信解析"`。
  - `SAFE_PAYLOAD_FIELDS.interview_score` 增加 `bands, overallBand, evidence, states, review`；`SAFE_PAYLOAD_FIELDS.rejection_parse` = `["parse", "candidateId", "ledgerStatus"]`。
  - `SAFE_NESTED_FIELDS` 增加 rubric 维度键与嵌套键：`structure, specificity, highlight, timing, effectiveEvidence, mainGaps, stateVerdict, betterStructure, quote, reasonLabel, freeText, company, role`（parse 子对象展开后的键）。
  - 输入契约测试打在**投影后形状**上（sanitizePayload 输出含全部 rubric 键），不是打在 handler uiPayload 上。
- **复盘页数据送达**：`/api/sessions` GET（或其读回路径 session-api-readback）在序列化 interviewState 前调用 `projectDurableInterviewEngineState`——durable 会话补上 planSnapshot 形状后客户端 parseServerSession 即可接受；**只读投影、不回写**（单写者规则不变，沿 execution-session-service 的既例）。实现取改动最小的一条读路径（实现时确认 sessions GET 与 readback 哪个是复盘页数据源，两处都改也可）。
- 客户端 `parseServerSession`（sessions.ts）保持 planSnapshot 守卫不动——由服务端投影满足形状，不改客户端解析。

### WP1 投影扩展（rubric 持久化）
- `InterviewAnswer`（engine.ts）加可选 `rubric?: { bands; overallBand; evidence; states; review }`（形状 = RubricScoredAnswer 的直取子集）。
- **写点在 `handleInterviewSessionTurnForAgent` 的 answers.push**（interview-analysis-service.ts:478-485 一带）：`scoreSessionAnswer` 返回形状扩为 `{ score, feedback, rubric }`（当前 :664-699 把 rubric 全部丢弃，需透传），push 时带上。done 分支 result.answers 不带 rubric（复盘只从持久 state 读）。
- `projectDurableInterviewEngineState` 把 `answers[].rubric` 投影进 scoreArtifacts 条目（新可选字段，与 E4 的形状统一见 WP2）。
- 守卫安全已确认：parseInterviewSession 硬校验仅 company/role/phase，answers 原样透传。

### WP2 前端信任卡（工具卡新增分支 + 复盘页改造）
- **工具卡是新增分支**（AgentToolCards.tsx 现无 interview_score 分支，照 interview_questions 分支模式）：主显 `锚定词 · N/4`（0 未作答/1 薄弱/2 基础/3 扎实/4 出色，与 rubric prompt 逐词一致）；每维一行档位+三态徽标（none 不显示）；证据引用收起、「查看评分依据」展开（触发 WP5 埋点）；复盘四段折叠。**未评分语义**（v2，M6）：无 bands/overallBand 字段 = 未评分态，显示「本轮未评分」+WP6 观察，不与 band-0（未作答）混淆。
- **复盘页**（InterviewRecapReview.tsx）：
  - 逐题行 ` · ${item.score}/5` → ` · 锚定词 N/4`（读 rubric.overallBand）；无 rubric 的旧会话回退——**刻度统一处理**（E4）：durable 路径 score 为 /10（overall×2），legacy 为 /5；新代码统一显示档位制，旧数据回退时 durable /10 先 ÷2 映射回 1-5 再显示 `X/5`，杜绝 "7.6/5"。
  - `averageScore` 重写（E4 崩溃点）：`item.score?.overall` 可选链 + 双形状适配（tool 路径 artifact 有 .score 子对象、durable 投影无）；平均优先档位制（有 rubric 的题），混合旧题时只对同刻度题取均值，跨刻度不平均。
  - **scoreArtifacts 形状统一**（E4）：投影侧 artifact 统一为 `{questionNodeId, score: {overall, bands?, evidence?, states?}, feedback, createdAt}`——给投影产物补上 .score 包装层（`as unknown as` 硬转改掉），复盘页消费单一形状。
- **X/5 清理范围**（E5，v2 扩大）：①InterviewRecapReview 两处；②interview-tools.ts scoreFormat 的「综合评分 X/5」与维度「v/5」改为档位词+`N/4`（这是模型可见文本，不改则模型叙述与卡片口径打架）；③interview-session-state.ts 复盘动态字符串（:623/675/685/742「平均评分 X/5」等）同步档位化。**JD 评估 0-5 分制（formatFivePointScore）合法存在，grep 断言限定在这三个文件内**，不得全局扫 /5。
- 设计令牌纪律不变（verify:tokens 覆盖）。

### WP3 拒信确认卡
- **前置 = WP0 的 rejection_parse 白名单**（否则卡片不渲染）。
- AgentToolCards 新增 rejection_parse 分支：标签中文描述（REJECTION_LABEL_DESCRIPTIONS 映射）+ 原文引用 + 「确认入账 / 忽略」按钮。
- 确认 → `PATCH /api/memory/candidates` `{ id: candidateId, action: "confirm", confirmedJobUse: true }`（M7：sensitivity=job_sensitive 候选 confirm 需带 confirmedJobUse 否则 400——拒信原因属求职敏感，恒带 true 即用户点确认的语义本身）。
- **candidateId 缺失降级**（M7）：ledgerStatus 无 candidateId（discovery 关闭被拒/敏感 clarify 未产候选/非 PG）时按钮区降级为说明文字，不显示可点按钮。
- 忽略 → 不调用，30 天自动过期。`confirmRejectionToLedger` 注释降级为备用接缝。

### WP4 薪资 asOf 保鲜
- seed json 顶层 `asOf: "2025-06"`；`SALARY_STALE_MONTHS = 9` 导出。
- `staticSeedEntries` **两处** sourceLabel（store :64 与 :81）统一走时效函数；`SalaryBenchmarkEntry` 增加 `isStale: boolean`（M5：机器可读，实现按字段分支而非字符串匹配）。
- **同步视图联动**（M5a）：`knowledge/salary-benchmarks.ts` formatBenchmarkForLLM 的「静态参考数据」标题同样按 isStale 降级「方向参考（数据截至 2025-06，仅看量级）」。
- D 板块 salaryContext：isStale 时追加「仅作方向参考，不得给出具体谈判数字，只讨论量级区间」。
- 时效按查询时动态计算（无缓存，已确认）。

### WP5 感知指标（perception_events）
- 表（只增）：`perception_events(id BIGSERIAL, user_id, metric, payload JSONB, created_at)` + `(metric, created_at DESC)` 索引；服务端模块 `perception-events.ts`（fire-and-forget、Postgres-only、失败 console.warn）。
- **客户端写路由**（M1，v2 新增）：`POST /api/perception-events` `{ metric, payload }`——getCurrentUser 鉴权、metric 白名单四值、payload ≤1KB、无 PII；仅 score_evidence_expand 走此路由，其余三个服务端直写。
- 四指标落点（v2 修正）：
  1. `fact_gate_repair`——完整链（M2）：optimization 的 per-variant `provenanceRetried` 落 **draft content_json.factuality**（per-variant 粒度，artifact 级会因重试通过者与一遍通过者并存而失真）→ `create_resume_edit_proposal` 从已加载 draft 读出存入 proposal（`resume_edit_proposals` 表加列 `provenance_retried INTEGER NULL`——只增 schema；无 draftId 的提案为 NULL，埋点时 NULL 不记）→ apply 读出埋点 `{artifactId, retried}`。
  2. `score_evidence_expand`——客户端展开动作 → 新路由 → 落库 `{dimensionCount}`。
  3. `sourced_jd_follow_through`——`reports` 表加列 `salary_data_source TEXT NULL`（M3：durable 持久化路径写入，替代字符串匹配 blocks_json）；投递状态更新埋点位在 `update-application-status.ts`（有 principal 与 reportNum）：查该 reportNum 的 salary_data_source 非空则记 `{reportNum, sourced: true}`（无窗口，payload 带 report 时间戳事后可算）。
  4. `question_source_followup`——**埋在 service 层**（M4）：`generateInterviewQuestionsForAgent` 的题库成功分支记 `{bankUsed, total}`（composeInterview 已返回 bankUsed；durable 逐题 count=1 时 total=1，聚合语义=按出题事件记录，分析侧按 session 聚合）。
- 无查询 UI（SQL 直查；dashboard 非本列车）。

### WP6 未评分兜底观察
- `buildUnscoredObservations(answer)`（纯函数，放 interview-analysis-service 或独立 util）：长度档（<50 字过短）、含数字与否、是否单句收尾（句号/问号计数 ≤1）；产 1-2 条可行动建议并入未评分分支 suggestions。不算评分、不入趋势。未评分态渲染见 WP2。

### WP7 文档与口径
- UPGRADE-PLAN-2026-10B.md：B→F 板块笔误修正（:61）；NOT in scope 追加语音面试（触发：面试教练月活达标）与简历视觉层反测（触发：10 用户回访完成）。
- evals/README.md：0.19.0 实测清单（评分卡展开/拒信确认/薪资降级标注/埋点验证 SQL 样例）。
- CONTEXT.md：新增「方向参考」词条（超时效薪资数据的降级标注语义；「静态参考」的反义降级态）。

## Testing Decisions

- **WP0（v2 提级为独立测试面）**：sanitizePayload 对 interview_score 输出含 bands/evidence/states/review 全键；rejection_parse 投影 kind 不再 silent 且含 candidateId；投影白名单回归——从 SAFE_PAYLOAD_TYPES/SAFE_PAYLOAD_FIELDS 的键存在性断言（防未来再被剥）。
- WP1：投影测试（含 rubric → scoreArtifacts 带全字段；旧状态无 rubric 不报错）；scoreSessionAnswer 返回形状契约。
- WP2：锚定词映射纯函数（0-4→词）；**/5→档位迁移的三文件 grep 断言**（限定文件清单，排除 JD 0-5 合法区）；averageScore 双形状/双刻度测试（含 null 安全）。
- WP3：卡片输入契约（投影后 uiPayload 字段）；confirmedJobUse 恒带断言；candidateId 缺失降级分支。
- WP4：isStale 边界（9 个月内/外）sourceLabel 两态；formatBenchmarkForLLM 联动；D 板块追加措辞断言。
- WP5：四指标触发点各一条服务端测试（mock 表写）；客户端路由鉴权+白名单+大小限；fire-and-forget 失败不抛。
- WP6：buildUnscoredObservations 三类观察正反例。
- 基线回归：feature-baselines 增「API 形状仍含 overall（X/5 字段不删，防下游破坏）」。

## Out of Scope

（同 v1：dashboard UI、语音、视觉反测、独立评分路径持久化、旧会话回填；另明确：模型可见文本的全面档位化若实现时发现第三处遗漏，随本列车顺手改，不扩范围。）

## Further Notes

- v2 修订依据：实现前审查（2026-10-04）E1-E5/M1-M8 全量吸收；关键新认知——**surface-projection 白名单是前端一切的数据闸门**（E1/E2），复盘页送达路径是 WP1 的前置（E3），durable /10 与 legacy /5 双刻度贯穿 WP2 所有显示位（E4）。
- 估时：2-3 天（AI 辅助）；WP0→WP1→WP2 严格串行（数据通路→持久化→渲染），WP3/4/5/6 可并行。
