# Spec 03: Task Program Registry And Deterministic Progression

**Target label:** `ready-for-agent`  
**Depends on:** Spec 01, Spec 02, ADR-0019

## Problem Statement

当前 Run Contract 多在执行末尾判分，模型、页面和 worker 仍可能各自决定阶段是否完成。于是 JD 评估、文件导出、岗位发现和简历修改等任务即使未形成报告、文件、扫描读回或版本验证，也可能显示成功。对话型目标又容易被过度套入写入流水线，损害正常的职业定位和面试辅导体验。

## Solution

建立版本化 **Task Program** registry。每个显式用户目标由一个 Program 定义阶段图、允许能力、Run Gate、verified facts、Artifact 规则、用户安全失败出口和成功终态。确定性 Program 通过 reducer 依据持久事实推进；对话型 Program 保留上下文、预期输入与任务专属完成条件，但不虚构写入或 Artifact 阶段。首批按 JD Evaluation、File Export、Job Search 的顺序完成纵切。

## User Stories

1. 作为求职者，我希望 JD Evaluation 只有在报告已保存并读回后才显示完成，从而能实际打开结果。
2. 作为求职者，我希望 File Export 只有在文件存在、非空且可下载后才显示成功，从而不会得到空链接。
3. 作为求职者，我希望岗位发现先展示岗位发现确认，再创建扫描并读回岗位机会池，从而始终知道系统在做什么。
4. 作为求职者，我希望简历修改先生成简历草稿工件并等待批准，从而不会发生未授权写入。
5. 作为求职者，我希望模拟面试能连续记住题号、回答和绑定材料，从而每次回答不会重开第一题。
6. 作为求职者，我希望职业定位和 Offer 报告解释保留只读、连贯的对话体验，从而不被不必要的 Gate 打断。
7. 作为评测人员，我希望每个 Program 有版本和专属 eval suite，从而可以准确回放功能回归。
8. 作为实现 Agent，我希望模型只能生成当前阶段内容，而不能自行跳过验证或持久化步骤。

## Implementation Decisions

- Task Program 以 registry 注册，定义 Program version、执行深度、阶段图、允许能力、Gate、required verified facts、Artifact 生命周期、成功出口、失败出口和配套 eval manifest。
- Program 发起研究委派前声明结果为必需或辅助；子 Run 失败、超时或结构化输出校验失败均不能生成 verified fact。辅助结果缺失时可明确说明限制并继续，必需结果缺失时父 Run 保持可恢复等待，不能宣称成功。
- Run Admission 选择 Program；Run Contract 是 Program 绑定具体用户、Conversation、Artifact 版本和 Constraints 后的实例，不能反向取代 Program。
- 确定性 Program 的 stage 只由 reducer 根据 verified facts、Run Gate、Continuation Stimulus 和 checkpoint 变化推进。Tool Attempt 成功、assistant 文本或页面显示不得单独满足 effect、persist 或 read-back 阶段。
- 对话型 Program 必须绑定正确 Context 和 Artifact、表达下一轮 expected input、受任务专属成功条件约束，并输出安全视图；它们不强制虚构写入或 Artifact。
- 模拟面试以整场面试为同一个 Run；生成第一题或完成单题反馈后进入 `waiting_user`，不能据此标记整场成功。已有回答时，用户对当前面试明确要求结束或完成约定题数后，必须生成复盘并持久化读回，Run 才能进入 `succeeded`。用户在零回答时明确要求结束当前面试则进入 `cancelled`，保留已出题记录，向用户说明未生成复盘。
- 模拟面试标准场默认 8 道主问题，结尾最多 2 次反问练习；每道主问题最多追问 2 次，整场追问总数最多 8 次。追问只能补当前回答的具体行为、判断依据或结果证据，始终归属原主问题且不嵌套。模型可以建议追问，Program 负责校验范围、预算、归属和阶段推进。
- 当前回答已充分、追问预算用尽或用户明确要求跳过当前题时，Program 必须结束本题的反馈或跳过记录并推进下一主问题；短回答不得触发超额追问。完成约定主问题及反问环节或用户明确提前结束当前面试后，按前述复盘与终态规则收口。回答中的叙述、引用与假设不能当成跳题或结束指令。
- 首批纵切顺序固定为 JD Evaluation、File Export、Job Search；之后才迁移 Resume Edit、Interview Coaching 与其余任务。每一纵切完成后删除该任务在旧入口、末尾判分和 prompt 中的阶段 ownership。
- Offer Report explanation、negotiation guidance 和 HR inquiry 是独立只读 Program，必须绑定既有 Offer Report，禁止重新执行 Offer Evaluation。
- Resume Edit、JD Evaluation、Offer Evaluation、Profile Update、Reference Resume Save、File Export 与 Job Search 的成功条件均要求相应 verified effect、Artifact 持久化或 read-back。
- Program 失败必须区分等待用户、可恢复失败、安全暂停和永久失败，并以用户安全结果结束，不能用通用成功文案覆盖失败。

## Testing Decisions

- 在 Program reducer seam 使用 verified fact sequences 测试每个阶段的合法与非法推进，断言外部 Program state、Artifact 和 Run terminal 状态。
- 覆盖缺失必做 fact、Tool 返回 success 但 read-back 失败、重复 Tool Attempt、Gate 后错误阶段恢复、终态后再推进和错误 Artifact 版本。
- 每个首批 Program 同时拥有 runtime simulation、真实持久化 E2E、浏览器短链路和对应生产失败回放；缺一不可视为未完成。
- 固化会话 106、107、113、114、115、116 和 118 为 hard-gate fixtures，验证报告、文件、scan、机会池、题号和回答读回。
- 对对话型 Program 验证正确的 Context 与 Artifact 绑定、expected input 和安全输出，而不测试模型的私有提示词或内部函数调用。
- 模拟面试验证第一题及逐题反馈后的 Run 仍可续跑；复盘读回失败不得进入 `succeeded`，读回成功后才可完成整场 Run；零回答结束进入 `cancelled` 且不生成空复盘。
- 模拟面试覆盖连续短答、追问范围与原主问题归属、单题及整场预算、跳题、反问独立计数、worker 恢复后预算不重置，以及达到计划题数后的复盘读回。
- 模拟面试覆盖“我当时想结束面试”“面试官说下一题”等叙述或引用，断言不会提前结束或跳题。
- 使用 Program version 与 fixture version 绑定历史评测，升级 Program 不得重写旧 Eval Run 的判定。

## Out of Scope

- 不把所有任务统一成刚性写入流水线。
- 不由本 spec 决定 Run Admission 的语义或 Continuation Stimulus 的原子协议。
- 不用质量 Judge 替代 verified facts、read-back 或确定性安全门禁。

## Further Notes

- 该 spec 的 reducer 输出为 Spec 04 的 Conversation Item Projection 提供阶段、Artifact 和安全状态事实。
- 任务名称必须使用领域词表，例如岗位发现、简历修改事务、简历草稿工件与 Offer Report。
- 每个 Program 的 feature flag 删除条件由 Spec 05 管理，统一生产切换由 Spec 07 管理。
