# Spec 33: Trust Card Kit And Perception Completion(信任卡套件+感知补齐,A1+B5)

Target label: `ready-for-agent`
Depends on: Spec 30(0.19.0 信任卡既有实现)、Spec 26/28/29 既有字段、surface-projection 白名单既定纪律;批次 0.21.0

## Problem

CEO 定性「80% 价值锁在服务端,前端零渲染」。0.19.0 交付了两张卡,但:①样式全是组件内局部常量(`InterviewTrustCards.tsx:34` 的 `COMPACT_CARD_CLASS`、徽章 :75、确认按钮 :192),不可复用;②复盘页 319 行里塞 4 个本地组件+7 个辅助函数,档位换算与信任卡重复维护(`InterviewRecapReview.tsx:12-17` scoreBadge、:28-38 averageScore);③优化链软门的 `advisory`/`advisoryReason`/`faithfulnessScore` 已持久化并透传(`resume-optimization-service.ts:287-294`、`:360-363`)但前端 `OptimizeVariant` 类型(`src/types/index.ts:392-397`)无 advisory 字段、`optimize-panel.tsx:551` 只渲染 label 前缀——降级素材在、渲染缺;④**D 板块薪资来源**(`salaryDataSource` 已持久化进 D 板块正文链路)没有独立来源卡组件;⑤感知四指标的服务端上报**已全部接通**(`perception-events.ts` 白名单含全部 4 指标:score_evidence_expand 走前端直报,fact_gate_repair 走 proposal riskFlags `provenance_retried`,sourced_jd_follow_through 走 reports.salary_data_source 列+application-workflow 上报,question_source_followup 走 service 层)——缺的是**统一查询视图**,无任何 dashboard 可看;⑥辅助 UI 大量复制(页头/搜索/空态/浮层,归 spec 34)。

## Solution

**自建信任卡原语套件**(grilling Q4:assistant-ui 0.15.22 实测无 citation/confidence/recommendation 原语,不升级不赌路线图;动效用 **framer-motion** ^12.38.0,已在树):

1. **TrustCard kit**(新目录 `src/components/agent/trust/`):档位徽章、证据展开(动效)、降级卡、「仅供参考」标注、确认按钮、**来源卡**六原语;档位换算逻辑(band-labels 映射、/10 与 /5 归一、三态词)收进 kit 单一模块,TrustCards 与 RecapReview 共用,消灭双维护。
2. **优化方案降级卡**:`OptimizeVariant` 类型补 advisory 字段,面板渲染 advisory 产物的降级卡(视觉:「仅供参考」徽章 + advisoryReason 提示行),替换现在的纯文本前缀。
3. **D 板块来源卡**:`salaryDataSource`(含「方向参考」时效降级态)组件化为独立来源卡,替换正文中拼接的来源句——渲染既有字段,含 spec 30 的 isStale 降级态。
4. **既有卡片换装**:InterviewScoreCard/RejectionParseCard/复盘页改用 kit 原语;卡片视觉遵循现有 design kit 令牌,不新造样式体系。
5. **感知查询视图+最小仪表盘**(grilling Q6):四指标上报已通,新增 `/api/perception-events/summary`(或复用既有报表读路径)聚合查询;**最小仪表盘**单页一图(四指标近期趋势/分组条),shadcn chart 抄入 2-3 个文件 + recharts 3.10.1(已在树);放 analytics 页新增区块,不新增路由。

## User Stories

- 用户点开评分卡:档位、逐维三态、证据引用展开有动效,读得懂「为什么是这个档」。
- 用户收到「仅供参考」的优化方案:一眼看到降级徽章与原因,而不是一行容易漏看的前缀文字。
- 用户确认拒信入库:按钮态、确认后的状态流转提示清晰。
- 我(CEO)打开 analytics:一眼看到四个信任指标的趋势。

## Implementation Decisions

- kit 只渲染既有字段与既定语义,不在卡内新增计算或话术(信任卡领域词约束);服务端零改动(投影白名单已放行的字段够用;若实现中发现缺字段,按 surface-projection 三处同步纪律扩,不绕闸门)。
- 动效仅用 framer-motion 的 layout/opacity,不上重 Springs;遵循 `prefers-reduced-motion`。
- 感知上报已全部接通,本 spec **只加查询**(summary 聚合)与展示,不开新上报通道、不动既有四路落点。
- 组件命名用 CONTEXT.md 领域词(信任卡/评分锚点/方向参考),不造新黑话。

## Testing Decisions

- kit 原语渲染测试:档位→颜色/文案映射、降级卡 advisory 字段渲染、来源卡 isStale 降级态、确认按钮状态流转。
- 换装回归:TrustCards/RecapReview 现有测试迁移到 kit 后全绿;投影白名单契约测试不放松。
- summary 聚合接口补确定性测试(metric 白名单、无个人内容、只读)。

## Out of Scope

- B4 页头/搜索/空态/浮层迁移(spec 34);B6 hook 拆分(spec 35);感知指标的多用户治理视图;旧会话信任卡回填(Spec 30 out-of-scope 维持)。

## Further Notes

- 施工顺序:B6(35)先行拆 hook → 本 spec 换装,避免在巨石上继续堆;34 的原语可并行。
- `use-agent-conversation.tsx`(2346 行/24 useState)是热点第 6(9 月以来 14 次变更),本 spec 是它换装前最后的「堆料」窗口——按顺序执行就不违反 B6 的约束。

## 实施记录(2026-10-06,0.21.0)

- 词汇/公式单一源定在 **knowledge/registry/band-labels.ts**(DIMENSION_LABELS/bandFromFiveScale/scoreBadge),band-scale.ts 为客户端转发层;interview-session-state 反向引用注册表,消灭三份拷贝。
- **记录在案的偏差**:①「仅供参考」前缀双通道——服务端 label 前缀(advisory 持久化形态)+ advisory 结构化字段并存,面板用正则剥前缀渲染徽章;改协议需动持久化 content_json 契约,留给后续列车。②D 板块来源卡是**追加**非替换——服务端 blocks.d 的来源句由 Spec 28/30 的注入契约治理(含引用纪律句),移除需 eval 重校准,本轮只加卡片渲染 salaryDataSource(stale 判据=「方向参考」前缀)。③感知 metric 词汇抽 leaf 模块 `src/lib/agent/perception-metrics.ts`(纯数据零依赖),服务端写入通道与客户端仪表盘共用。
