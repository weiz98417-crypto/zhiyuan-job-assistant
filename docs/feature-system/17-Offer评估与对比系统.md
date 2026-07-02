# 纸鸢求职助手 Offer 评估与对比系统的产品构造

纸鸢求职助手的 Offer 系统，不是一个“薪资计算器”。它要帮助用户在最终收口阶段判断：这份 Offer 值不值得接、还有哪些信息必须问 HR、哪些条款可以谈判、多个 Offer 应该如何取舍。

因此，单 Offer 评估和多 Offer 对比不应该拆成两个独立系统。它们共用同一套 Offer 数据、同一套评估模型、同一套报告持久化和 Agent 工具。区别只是任务模式不同：一个是判断单个机会是否值得接受，另一个是在多个机会之间做排序和取舍。

## 1. 产品定位

用户拿到 Offer 后，常见判断并不是“月薪多少”这么简单。真正需要判断的是：

- 税前月薪、薪数和年终奖合起来的现金包。
- 社保、公积金是足额缴纳还是最低基数。
- 用工主体是正式劳动关系、外包、派遣还是其他形式。
- 试用期和合同期限是否合理。
- 加班、通勤、城市生活成本是否影响实际收益。
- 奖金、股权、期权是否能兑现。
- 公司和岗位是否有成长价值。
- 这份 Offer 能不能谈，应该问 HR 什么。
- 如果同时有多个 Offer，哪个更适合当前目标。

纸鸢的 Offer 系统承担的是“求职最终决策层”：

```text
Offer 文本 / 截图 / 结构化字段
  -> OfferSnapshot
  -> 单 Offer 模块评分
  -> redFlags / missingInfo / negotiationLevers / hrQuestions
  -> Offer 报告保存与读回
  -> 谈判策略 / HR 问题清单
  -> 多 Offer 对比与排序
```

## 2. 为什么不能只看月薪

同样是 30K，真实价值可能完全不同：

- 30K * 12 和 30K * 15 的年现金差很多。
- 足额五险一金和最低基数缴纳差很多。
- 正式劳动关系和外包派遣风险不同。
- 年终奖“保证发”和“看绩效”不是同一件事。
- 一线城市高通勤和高生活成本会影响到手感受。
- 试用期过长、合同期限过短会影响稳定性。
- 业务边缘岗位和核心岗位的履历价值不同。

所以 Offer 系统不能只做一个薪资字段。它必须把现金、福利、合同、风险、成长和谈判空间放到同一张决策表里。

## 3. 页面入口与代码边界

当前 Offer 系统主入口是 `/compare` 页面，对应 `src/app/compare/page.tsx`。

核心项目事实包括：

| 能力 | 项目文件或接口 | 产品含义 |
|---|---|---|
| Offer 页面 | `src/app/compare/page.tsx` | 录入、编辑、评估和对比 Offer |
| Offer 数据 API | `src/app/api/offers/route.ts`、`src/app/api/offers/[id]/route.ts` | 按用户保存 Offer 基础事实 |
| Offer 报告 API | `src/app/api/offer-reports/route.ts`、`src/app/api/offer-reports/[id]/route.ts` | 保存单 Offer 或多 Offer 报告 |
| 评估模型 | `src/lib/offer-evaluation.ts` | 将 OfferSnapshot 变成模块评分和结论 |
| 保存校验 | `src/lib/offer-persistence-verifier.ts` | Offer 和报告保存后的 read-back 验证 |
| 单 Offer 工具 | `src/lib/agent/tools/action/evaluate-offer.ts` | Agent 调用单 Offer 评估 |
| 多 Offer 工具 | `src/lib/agent/tools/action/compare-offers-deep.ts` | Agent 调用多 Offer 对比 |
| 谈判策略 | `generate-offer-negotiation-strategy.ts` | 基于已保存报告生成谈判策略 |
| HR 问题清单 | `generate-offer-hr-question-list.ts` | 基于缺失信息和红旗生成追问清单 |

这说明 Offer 系统是一个完整决策链路，而不是一个页面按钮。

## 4. OfferSnapshot

系统评估前会先把用户输入转成 `OfferSnapshot`。它可以来自：

- 已保存的 `offerId`。
- 用户粘贴的 Offer 文本。
- Offer 截图识别结果。
- 页面表单里的结构化字段。

关键字段包括：

| 字段 | 产品含义 |
|---|---|
| `company` | 公司 |
| `role` | 岗位 |
| `location` | 城市或办公地点 |
| `monthlySalary` | 税前月薪，单位 K |
| `monthsPerYear` | 发薪月数 |
| `annualBonus` | 年终奖月数 |
| `hasSocialInsurance` | 是否缴纳社保 |
| `socialInsuranceBaseType` | 足额、最低基数或未知 |
| `housingFundRate` | 公积金比例 |
| `probationMonths` | 试用期 |
| `employmentForm` | 正式、外包、派遣、实习、承包或未知 |
| `employerName` | 用工主体 |
| `contractMonths` | 合同期限 |
| `overtimePolicy` | 加班政策 |
| `bonusGuarantee` | 奖金兑现规则 |
| `equityType` / `equityVesting` | 股权类型与归属安排 |
| `commuteMinutes` | 通勤时间 |
| `cityCostLevel` | 城市成本等级 |
| `jobNature` | 岗位业务性质 |

这个结构说明：Offer 评估不是模型自由判断，而是先把 Offer 拆成可计算、可追问、可保存的事实。

## 5. 单 Offer 评估模型

`src/lib/offer-evaluation.ts` 里定义了当前模型版本：

```text
OFFER_MODEL_VERSION = "cn-single-offer-v1"
```

评估由 10 个模块组成：

| 模块 | 权重 | 判断内容 |
|---|---:|---|
| `completeness` 信息完整度 | 8 | 关键字段是否齐全 |
| `cash` 现金收入 | 20 | 月薪、薪数、年终形成的税前现金包 |
| `tax` 社保与税后 | 10 | 社保、公积金、缴纳基数 |
| `benefits` 合同与福利 | 12 | 用工形式和福利落地风险 |
| `contract` 试用期与合同 | 15 | 试用期、合同期限、续签风险 |
| `workload` 工时与生活 | 12 | 加班、通勤、生活压力 |
| `bonus_equity` 奖金与股权 | 8 | 奖金兑现和股权条款 |
| `city` 城市与通勤 | 5 | 城市成本和办公地点 |
| `growth` 成长价值 | 10 | 岗位业务价值和履历迁移价值 |
| `stability` 稳定性 | 10 | 用工稳定性和主体一致性 |

总分计算逻辑是：

```text
weightedScore = sum(module.score * module.weight) / sum(module.weight)
overallScore = weightedScore - missingInfoPenalty
```

缺失信息越多，系统会做保守扣减：

- 缺失信息达到 3 项，扣 0.25。
- 达到 5 项，扣 0.4。
- 达到 8 项，扣 0.6。

这体现了产品判断：Offer 信息越不完整，用户越不能贸然做最终决定。

## 6. 结论类型

模型输出的 `verdict` 有四类：

| verdict | 产品含义 |
|---|---|
| `accept` | 建议接受 |
| `accept_after_negotiation` | 建议谈判后接受 |
| `proceed_cautiously` | 谨慎推进 |
| `decline` | 不建议直接接受 |

判断规则不是只看总分：

- 总分高且没有红旗，才会进入 `accept`。
- 总分较高但仍有谈判点，进入 `accept_after_negotiation`。
- 中等分进入 `proceed_cautiously`。
- 低分进入 `decline`。

这让系统不会因为“钱看起来高”就忽略合同、用工形式、社保或加班风险。

## 7. redFlags、missingInfo 与 negotiationLevers

Offer 报告最重要的不是总分，而是三组行动信息。

### redFlags

`redFlags` 是风险信号，例如：

- 社保/公积金按最低基数或低基数缴纳。
- 用工形式存在合规或稳定性风险。
- 试用期偏长。
- 合同期限偏短。
- 加班强度高。
- 年终或提成兑现不确定。
- 股权归属和行权安排不清。

### missingInfo

`missingInfo` 是必须向 HR 补问的信息，例如：

- 城市/办公地点。
- 用工形式。
- 合同期限。
- 加班与补偿方式。
- 奖金兑现规则。
- 用工主体名称。
- 社保缴纳基数。

### negotiationLevers

`negotiationLevers` 是可以谈判的抓手，例如：

- 争取更高公积金比例。
- 争取奖金保底或书面确认。
- 确认主体并争取正式劳动关系。

这三组信息把评估结果转成下一步行动：该问什么、该谈什么、什么风险不能忽略。

## 8. 到手估算

`estimateNetIncome()` 会基于税前月薪、社保、公积金和薪数做一个到手估算。

它输出：

- `monthlyNetMin`
- `monthlyNetMax`
- `annualNetMin`
- `annualNetMax`
- `assumptions`

当前假设明确写着：

- 按税前月薪估算到手。
- 按社保公积金缴纳情况估算。
- 未考虑专项附加扣除差异。

所以文档必须写清楚：这是求职决策估算，不是法律或个税精算。

## 9. 单 Offer 工具链路

`evaluate_offer` 工具支持三类入口：

```text
offerId
offerText
images
```

如果用户上传 Offer 截图，工具会调用 `/api/agent/image-intake`，并指定 `preferredDocumentType: "offer"`。如果截图无法提取有效 Offer 信息，会要求用户上传更清晰图片或粘贴文本。

单 Offer 评估完整链路是：

```text
解析 Offer 文本 / 截图 / 字段
  -> 生成 OfferSnapshot
  -> 保存 Offer
  -> read-back 校验 Offer
  -> evaluateOfferSnapshot
  -> 保存 Offer report
  -> read-back 校验 report
  -> 写入 Offer 相关记忆候选
  -> 返回评分、结论、红旗和缺失信息
```

这条链路里，保存和读回是产品可信度的一部分。工具不会在 Offer 或报告未确认落库时向用户声明评估完成。

## 10. 报告持久化

`/api/offer-reports` 保存报告时会写入：

- `title`
- `report_type`
- `model_version`
- `offer_id`
- `overall_score`
- `verdict`
- `summary`
- `offer_snapshot_json`
- `modules_json`
- `red_flags_json`
- `missing_info_json`
- `negotiation_levers_json`
- `hr_questions_json`
- `assumptions_json`
- `take_home_json`
- `offers_json`
- `report_markdown`
- `num_offers`

保存后会进行两类校验：

- `offerReportReadBackMatches()`：确认报告本身写入正确。
- `offerLatestReportMatches()`：如果报告关联了 Offer，确认 Offer 的 `latest_report_id` 指向该报告。

如果校验失败，接口返回失败，并明确写着“已阻止成功提示”。这和评分系统、简历提案一样，都是项目里反复强调的 read-back 产品边界。

## 11. 谈判策略与 HR 问题清单

谈判策略和 HR 问题清单不是重新评估 Offer。

`generate_offer_negotiation_strategy` 会读取已保存报告：

```text
GET /api/offer-reports/{id}
  -> 读取 verdict、redFlags、missingInfo、negotiationLevers
  -> 生成 priority、openingLine、levers、riskBasedQuestions
```

`generate_offer_hr_question_list` 也读取已保存报告，并基于：

- `missingInfo`
- `redFlags`
- Offer 快照里的公司、岗位、用工形式

生成优先问题。

这说明：如果用户只是问“怎么跟 HR 谈”“还要问什么”，系统不应该重新跑 `evaluate_offer`，而应该复用已有报告。

## 12. 多 Offer 对比

`compare_offers_deep` 的触发条件很明确：只有用户明确说对比、比较、选哪个、多个 Offer 时才调用。单个 Offer 必须走 `evaluate_offer`。

它支持两种输入：

- `offerIds`：读取已保存 Offer。
- `offers`：直接传入多个 Offer 对象。

对比流程是：

```text
读取两个或更多 OfferSnapshot
  -> 分别 evaluateOfferSnapshot
  -> 按 overallScore 排序
  -> 返回 reports 和 ranking
  -> UI payload 展示各 Offer 分数、结论和主要红旗
```

多 Offer 对比不是重新发明一套评分，而是把单 Offer 模块评分放到同一把尺子下排序。

## 13. 为什么多 Offer 对比不能独立成另一个产品

多 Offer 对比依赖单 Offer 的所有基础能力：

- 同一套 `OfferSnapshot`。
- 同一套 10 模块评分。
- 同一套 `redFlags` 和 `missingInfo`。
- 同一套报告保存结构。
- 同一套 Agent 工具治理。

区别只是输出方式：

| 模式 | 输入 | 输出 |
|---|---|---|
| 单 Offer 评估 | 1 个 Offer | 是否接受、风险、缺失信息、谈判抓手 |
| 多 Offer 对比 | 2 个或更多 Offer | 排序、赢家、取舍逻辑、各自红旗 |

所以这两个入口应该归入同一个 Offer 决策系统的两种任务模式，而不是拆成两个互不相关的系统。

## 14. 用户链路

完整用户链路如下：

```text
用户录入 Offer 或上传 Offer 截图
  -> 系统解析并保存 Offer
  -> 系统生成单 Offer 评估报告
  -> 用户查看总分、结论、红旗、缺失信息、到手估算
  -> 用户继续生成谈判策略或 HR 问题清单
  -> 如果有多个 Offer，用户选择对比
  -> 系统按同一评分模型排序并解释取舍
```

这条链路服务的是最终决策，而不是单次模型问答。

## 15. 失败模式

| 失败点 | 典型表现 | 正确处理 |
|---|---|---|
| 输入不足 | 没有 offerId、文本或关键字段 | 要求补充 Offer 文本或字段 |
| 截图识别失败 | 无法提取有效 Offer 信息 | 要求更清晰截图或粘贴文本 |
| 缺公司或岗位 | `/api/offers` 拒绝保存 | 返回 company and role required |
| Offer 保存读回失败 | 写入后字段不匹配 | 阻止成功提示 |
| 报告保存读回失败 | report 或 latest_report_id 不匹配 | 阻止成功提示 |
| 单 Offer 误走对比 | 只有一个 Offer | 返回至少需要 2 个 Offer |
| 谈判工具无报告 | 没有 offerReportId | 要求先生成或选择报告 |

## 16. 测试与证据

当前项目的测试覆盖了 Offer 系统的关键边界：

- `src/__tests__/offer-evaluation-model.test.ts`：验证单 Offer 模型、信息缺失、社保基数、用工形式、奖金不确定等评分变化。
- `src/__tests__/offer-flow.test.ts`：验证 Offer intent 路由、工具集、单 Offer 与多 Offer 调用边界、谈判工具复用已保存报告。
- `src/__tests__/offer-persistence-verified-write.test.ts`：验证 Offer 和 Offer report 保存后必须能 read-back，且 latest report 链接正确。

这些测试说明项目的 Offer 系统已经从“问模型这份 Offer 怎么样”演进成了有数据、评分、报告、读回和任务边界的产品能力。

## 17. 产品总结

纸鸢 Offer 系统的真实结构是：

```text
输入层：文本、截图、offerId、结构化字段
事实层：OfferSnapshot
评估层：10 个模块加权评分
行动层：redFlags、missingInfo、negotiationLevers、hrQuestions
持久层：offers、offer_reports、read-back 校验
决策层：单 Offer 结论、多 Offer 排序、谈判与追问
```

它的产品价值是让用户在求职最后一公里做可解释决策：不是只看薪资，也不是让模型一句话建议接或不接，而是把待遇、风险、缺口、谈判和取舍全部结构化。
