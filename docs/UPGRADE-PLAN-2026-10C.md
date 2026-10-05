# UPGRADE-PLAN-2026-10C:0.20.0 → 0.22.0 三班车(信任补丁 / 前端信任周 / 导出与视觉)

主控文档。来源:2026-10-05 improve-codebase-architecture 第三轮评审(报告:`%TEMP%\architecture-review-20261005-235240.html`,临时目录会丢,结论全部沉淀进本文与 specs 31-38)+ 2026-10-06 grilling 全量决策(Q1-Q10,见下表)。前置状态:dev@4892dbd,CI 全绿(运行 37339314295),1490 测试基线。

## 列车总览

| 批次 | 名称 | 内容 | spec | 预估 |
| --- | --- | --- | --- | --- |
| 0.20.0 | 信任补丁 | B1 生成链事实门 + B2 LLM JSON 收口 | 31、32 | 1-2 天 |
| 0.21.0 | 前端信任周 | A1 信任卡套件 + B5 感知埋点补齐+轻仪表盘 + B4 工作台原语与浮层全迁 + B6 会话 hook 拆分 + B7 依赖瘦身 | 33、34、35、36 | ~1 周 |
| 0.22.0 | 导出与视觉 | B3 导出链路收敛 + A2 简历视觉反测回路 | 37、38 | 2-4 天 |
| 不占列车 | 语音备案 | A3 选型备案(触发:面试教练月活达标) | `docs/voice-interview-options-2026-10.md` | 文档 |
| 不占列车 | 用户回访 | 10 人回访(用户执行,验证 A2 深化需求) | `docs/user-callback-script-2026-10.md` | 线下 |

每班车走完整流程:spec → 实现 → code-review/eng-review → 三护栏+全测试绿 → CI 绿 → 下一班。B8(data-repositories.ts 3413 行)不专列:哪张表因产品需求被改,顺手把那张表的仓库抽成独立文件。

## Q1-Q10 决策表(2026-10-06 grilling 定稿)

| # | 决策 | 结论 |
| --- | --- | --- |
| Q1 | 切车 | 三班车如上;顺序即优先级;A3 后置,B8 机会主义 |
| Q2 | B1 失败语义 | 与优化链完全同款:硬门 veto=带溯源提示重试 1 次→仍失败报错**不出稿**(400+嫌疑数字清单);软门低分=出稿但强制「仅供参考」前缀+advisory 字段持久化。ADR-0041 已覆盖,不立新 ADR |
| Q3 | B2 是否引 zod | **不引**。纯收口到 llm-json.ts,各调用点既有校验逻辑不动;instructor-js 不引入(半休眠+模型已原生 JSON 模式) |
| Q4 | A1 原语策略 | **自建信任卡套件**(自家 design kit + motion)。实测 assistant-ui 0.15.22 无 citation/confidence/recommendation 原语(最新仅 0.15.23 补丁),不赌其路线图,维持 0.15.22 不升级;需要引用角标时单抄 Vercel AI Elements Inline Citation(Apache-2.0 已核实) |
| Q5 | B4 浮层范围 | **13 处全迁**,C3/C4 彻底收尾,kit 采用从 2 页变全覆盖 |
| Q6 | B5 仪表盘 | 补齐埋点 + **做最小仪表盘**(一页一图,shadcn chart copy-in + recharts 3.10 已在树);langfuse 不引入(三容器过重) |
| Q7 | A2 范围落点 | 回路先行(不等回访,两者并行);落**开发侧门禁脚本**,不做用户可见功能;模板美化本轮不做(等回路绿+回访反馈) |
| Q8 | A2 评审模型 | **只接 DeepSeek**(deepseek-v4.1-flash 原生视觉,既有 key 零注册)。不做 provider 抽象层——一个 adapter 不构成真接缝,将来加第二家时再抽 |
| Q9 | B6 拆分 | 搭 0.21 车;**先补源码契约测试锁行为,再按三片拆**(服务端投影解析/会话生命周期/界面状态);0.12 CRLF 事故为前车之鉴 |
| Q10 | A3 语音 | 不动工,只落选型备案;触发条件(面试教练月活达标)不变 |

## NOT in scope(本轮明确不做)

- 语音面试动工(Q10;触发条件登记在案)。
- 简历模板美化/重排(Q7c;等视觉反测回路绿 + 10 人回访反馈)。
- VLM 多 provider 抽象层(Q8;等第二个真实需求出现)。
- zod / instructor-js / langfuse / 新图表库引入(Q3/Q6)。
- data-repositories 大拆分(B8;机会主义)。
- Spec 23 扫码登录、生产部署执行(仍挂小账本,由用户择时)。

## 许可证红灯(评审实测,持续有效)

OpenResume(AGPL,停更)· Vivliostyle(AGPL)· OrangeX4 中文 Typst 模板(无许可证)· NorthSecond 模板(CC BY-NC)· ChatTTS(权重 NC)· edge-tts(逆向接口合规风险)· TEN framework(附加条件禁端侧)· boss-zhipin-scraper 思路仅可用于用户本地采集器(ADR-0043:服务端采集永久不做)。

## 依赖事实速查(grilling 前探查,specs 引用)

- antd 仅 `src/components/agent/AgentActivityTrack.tsx:4` 一处导入(Progress/Timeline/ConfigProvider,theme 切换 :79);`@ant-design/icons` 零导入 → 可整体卸载。
- `pdf2json` 零导入,纯声明(package.json:105)→ 直接删;`pdf-parse` 独占简历文本提取链(document-extraction)。
- 优化链事实门失败 UX:硬门 throw(`resume-optimization-service.ts:202-205`、faithfulness 全灭 :253)→ `api/cv/optimize-section/route.ts:82-83` 400 → `optimize-panel.tsx:214-215` error 文案;软门 :225-233 出稿带「仅供参考」前缀(:272、:284),advisory/faithfulnessScore 持久化 :287-294、API 透传 :360-363,但前端 `OptimizeVariant` 类型(`src/types/index.ts:392-397`)无 advisory 字段、`:551` 只渲染 label——spec 33 的降级卡素材。

## Specs 索引

| spec | 内容 | 批次 |
| --- | --- | --- |
| 31 | Generation Chain Factuality Gate(B1) | 0.20.0 |
| 32 | LLM JSON Consolidation(B2) | 0.20.0 |
| 33 | Trust Card Kit And Perception Completion(A1+B5) | 0.21.0 |
| 34 | Workbench Primitives And Overlay Migration(B4) | 0.21.0 |
| 35 | Agent Conversation Hook Split(B6) | 0.21.0 |
| 36 | Dependency Diet(B7) | 0.21.0 |
| 37 | Export Pipeline Consolidation(B3) | 0.22.0 |
| 38 | Resume Visual Review Loop(A2) | 0.22.0 |
