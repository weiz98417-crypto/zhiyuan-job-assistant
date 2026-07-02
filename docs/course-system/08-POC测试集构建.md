# 08 POC 测试集构建

本篇把 MVE 功能规划转换成可复跑的验证样本。POC 测试集是产品从 0 到 1 时用来判断“这个体验是否成立”的材料集合。

测试集要覆盖用户真实输入、业务对象、预期输出、页面承接和成功证据。

## 1. 测试集原则

| 原则 | 说明 |
|---|---|
| 来自真实求职场景 | JD、简历、Offer、面试、定位都要像真实用户材料 |
| 覆盖首版主线 | JD -> Reports -> 简历提案 -> CV read-back 必须覆盖 |
| 覆盖信任边界 | 不编造、不越权、不未确认写入、不假成功 |
| 覆盖低质量输入 | 低清截图、缺字段 Offer、模糊定位表达 |
| 结果可复查 | 每个样本都有目标页面和读回对象 |

## 2. 样本类型

| 类型 | 样本 | 用途 |
|---|---|---|
| JD 文本 | AI 产品经理、AI 运营、增长产品岗位 | 验证 JD 评估 |
| JD 图片 | 清晰截图、低清截图、混合截图 | 验证图片入口 |
| 简历 | 当前简历、目标 section、历史版本 | 验证查询和提案 |
| Offer | 完整 Offer、缺字段 Offer | 验证字段抽取和谈判 |
| 面试 | JD + 简历 + 回答 | 验证一题一答 |
| 定位 | “我不知道适合什么方向” | 验证 guided session |
| 账号 | pending、member、admin、userA/userB | 验证权限和隔离 |

## 3. POC 主线样本

| ID | 输入 | 预期产品行为 | 成功证据 |
|---|---|---|---|
| POC-01 | “帮我评估这个 AI 产品经理 JD 是否值得投” + JD 文本 | 进入 JD 评估 | 聊天摘要 + report 可读 |
| POC-02 | 清晰 JD 截图 | 识别为 JD 后评估 | documentType=JD，报告可读 |
| POC-03 | “我现在的简历是什么？” | 只读查询 | 不创建 proposal |
| POC-04 | “基于这个 JD 改个人概述，先给草稿” | 生成简历提案 | proposal pending |
| POC-05 | 用户确认应用提案 | 写入目标 section | section read-back |
| POC-06 | 从 Reports 回到 Agent 继续追问 | 记住当前 report | 继续围绕同一 JD |

## 4. 扩展样本

| ID | 输入 | 预期产品行为 | 成功证据 |
|---|---|---|---|
| POC-07 | Offer 文本或截图 | 抽取字段、提示风险 | offer report |
| POC-08 | “基于刚才 Offer 怎么谈？” | 生成谈判问题 | 使用当前 Offer 上下文 |
| POC-09 | “基于这个 JD 模拟面试” | 一题一答 | interview_state |
| POC-10 | “我适合什么方向？” | 进入定位追问 | profile guided state |
| POC-11 | 低清 JD 截图 | 要求重传或澄清 | 不生成确定报告 |
| POC-12 | memberB 猜 memberA report | 拒绝或空结果 | userId scope |

## 5. 样本字段

每条测试样本都记录：

| 字段 | 说明 |
|---|---|
| sampleId | POC 编号 |
| 用户角色 | 求职者、Offer 候选人、面试准备用户等 |
| 求职阶段 | 选岗、简历、Offer、面试、定位 |
| 输入材料 | 文本、截图、简历、Offer、账号 |
| 预期任务 | jd_evaluation、resume_query、resume_edit、offer_evaluation 等 |
| 目标页面 | Agent、Reports、CV、Compare、Interview、Profile、Admin |
| 成功证据 | read-back、verifier、页面状态、权限结果 |
| 风险边界 | 不编造、不越权、不误写、不假成功 |

## 6. 账号矩阵

| 账号 | 角色 | 用途 |
|---|---|---|
| admin | admin | 审批用户、审核记忆、查看运行复盘 |
| memberA | member | 创建 JD 报告、简历提案、Offer |
| memberB | member | 验证不能读取 memberA 资产 |
| pendingUser | pending | 验证未审批不能进入核心业务 |

## 7. 测试集交付

| 产物 | 内容 |
|---|---|
| POC 样本表 | 12 条主线与扩展样本 |
| 材料包 | JD、简历、Offer、面试回答、截图 |
| 账号矩阵 | admin/member/pending/userA/userB |
| 预期结果 | 每个样本的目标页面和成功证据 |
| 风险边界 | 明确哪些情况不能显示完成 |

结论：08 的输出不是产品缺陷清单，而是一组用于验证产品从 0 到 1 是否成立的样本。09 将记录这些样本的验证结论。

## 8. 样本内容示例

POC 样本要足够接近真实求职材料。下面是简化样例，真实验证时可以替换成更完整材料。

### JD 样本片段

```text
岗位：AI 产品经理
职责：
1. 负责 AI Agent 产品从需求分析、原型设计到上线迭代。
2. 与算法、工程、运营协作，设计多轮对话和工具调用体验。
3. 基于用户行为和业务指标持续优化转化。
要求：
1. 3 年以上 C 端产品经验。
2. 熟悉大模型应用、Prompt、RAG 或 Agent 工作流。
3. 有海外产品或内容社区经验优先。
```

用于验证：

- `evaluate` 能否识别岗位核心要求。
- 报告能否说明 C 端经验和 AI Agent 要求之间的匹配关系。
- 后续 `resume` 能否围绕“AI Agent 产品设计”生成简历提案。

### 简历样本片段

```text
个人概述：
5 年 C 端产品经验，曾负责海外社交和内容增长方向，熟悉用户增长、活动运营和数据分析。

项目经历：
负责直播场景下用户互动体验优化，通过用户分层和推荐策略提升留存。
```

用于验证：

- `resume_query` 只读返回当前简历。
- `resume_edit` 能生成“AI Agent 产品经验表达”的提案。
- 不得把用户没有做过的算法研发经历写进去。

### Offer 样本片段

```text
岗位：AI 产品经理
薪资：28K * 14
试用期：6 个月，试用期薪资 80%
福利：五险一金、补充医疗、年度体检
备注：入职后参与 Agent 商业化项目
```

用于验证：

- `offer` 能抽取薪资、试用期、福利和备注。
- 能提示试用期薪资、年包、谈判问题。
- 默认私有，不进入团队记忆。

## 9. 样本标注规范

每个样本都要带标注，否则后续无法判断通过或失败。

| 字段 | 示例 |
|---|---|
| sampleId | POC-JD-001 |
| materialType | JD 文本 |
| targetAgent | `evaluate` |
| expectedPage | Reports |
| expectedObject | `report` |
| mustNotHappen | 被路由到 `offer`；报告不可读回 |
| successEvidence | reportId 可读回，页面可见 |
| privacyLevel | private |
