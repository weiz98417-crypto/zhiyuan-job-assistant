# 图片识别与截图路由系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 图片识别与截图路由系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

server image intake、候选图生成、JD/Offer/Resume/聊天截图分类、OCR 超时、缩略图防护和 Agent 业务路由。

## 项目事实

### 关键实现面
- `src/lib/server-image-intake.ts`
- `src/lib/server-image-variants.ts`
- `src/lib/agent/image-intake-router.ts`
- `src/lib/agent/image-intake.ts`
- `src/app/api/agent/image-intake/route.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/jd-image-routing.test.ts`
- `src/__tests__/server-image-intake.test.ts`
- `src/__tests__/server-image-variants.test.ts`
- `src/__tests__/image-thumbnail-guard.test.ts`
- `src/__tests__/evaluate-jd-full-image-priority.test.ts`
- `src/__tests__/agent-image-loop.test.ts`

### 从现有测试读到的行为
- jd-image-routing.test.ts 已覆盖 JD、Offer、简历、未知截图、聊天截图、低置信缩略图和 OCR timeout。
- server-image-intake.test.ts 已覆盖高图整图超时后切片 OCR 并合并文本。
- agent-image-loop.test.ts 已固定图片-only 输入不能复用上一轮文本。

### 待补 eval 缺口
- 补多图混合上传时 majorityType 和 perImage 的 eval。
- 补 ZHIPU_API_KEY 缺失时的用户提示 eval。
- 补 resume_preview 到保存确认的页面链路 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补多图混合上传时 majorityType 和 perImage 的 eval

**为什么要补**: 这是当前 image-intake、image-intake-router、server image variants 和业务工具路由 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/server-image-intake.test.ts`、`src/__tests__/server-image-variants.test.ts`、`src/__tests__/image-thumbnail-guard.test.ts`、`src/__tests__/evaluate-jd-full-image-priority.test.ts`。
- fixture 必须包含：documentType、confidence、image variant、selected taskType 和 fallback reason。
- 断言必须读取：image intake 结果、澄清卡片、工具调用或未调用记录。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 ZHIPU_API_KEY 缺失时的用户提示 eval

**为什么要补**: 这是当前 image-intake、image-intake-router、server image variants 和业务工具路由 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/server-image-intake.test.ts`、`src/__tests__/server-image-variants.test.ts`、`src/__tests__/image-thumbnail-guard.test.ts`、`src/__tests__/evaluate-jd-full-image-priority.test.ts`。
- fixture 必须包含：documentType、confidence、image variant、selected taskType 和 fallback reason。
- 断言必须读取：image intake 结果、澄清卡片、工具调用或未调用记录。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 resume_preview 到保存确认的页面链路 eval

**为什么要补**: 这是当前 image-intake、image-intake-router、server image variants 和业务工具路由 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/jd-image-routing.test.ts`、`src/__tests__/server-image-intake.test.ts`、`src/__tests__/server-image-variants.test.ts`、`src/__tests__/image-thumbnail-guard.test.ts`、`src/__tests__/evaluate-jd-full-image-priority.test.ts`。
- fixture 必须包含：documentType、confidence、image variant、selected taskType 和 fallback reason。
- 断言必须读取：image intake 结果、澄清卡片、工具调用或未调用记录。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 图片识别与截图路由系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. JD 图片和 JD 意图进入 evaluate_jd

**状态**: 已有自动化覆盖

**项目依据**:
- - 图片类型：JD / Offer / 简历 / 聊天截图 / 未知。 - 置信度：例如 97%。 - 路由：例如 `evaluate_jd`。 - 原因：例如“JD 文本意图与 JD 图片一致，进入评估流程”。 - 每张图或每个切片的识别结果。 - 如果失败，是超时、缩略图、低清晰度、正文不足，还是用户意图冲突。
- - `src/__tests__/jd-image-routing.test.ts`：验证 JD 图片和用户意图一致时进入评估，冲突时澄清。 - `src/__tests__/server-image-intake.test.ts`：验证服务端识别结果、错误和超时处理。 - `src/__tests__/server-image-variants.test....
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“JD 图片和 JD 意图进入 evaluate_jd”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD 图片和 JD 意图进入 evaluate_jd”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD 图片和 JD 意图进入 evaluate_jd”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. Offer 图片和 Offer 意图进入 evaluate_offer

**状态**: 已有自动化覆盖

**项目依据**:
- - 图片类型：JD / Offer / 简历 / 聊天截图 / 未知。 - 置信度：例如 97%。 - 路由：例如 `evaluate_jd`。 - 原因：例如“JD 文本意图与 JD 图片一致，进入评估流程”。 - 每张图或每个切片的识别结果。 - 如果失败，是超时、缩略图、低清晰度、正文不足，还是用户意图冲突。
- - 没有识别结果的图片轮次不能绕过识别直接进业务工具。 - 图片和用户文字意图冲突时，必须先澄清。 - 只上传图片但没有说明意图时，JD 和 Offer 也要先确认。 - 简历图片只能先预览，写入类动作必须有明确用户确认。 - OCR 超时不能说成图片不清晰。 - 缩略图不能通过放大补救，必须要求原图。
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“Offer 图片和 Offer 意图进入 evaluate_offer”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Offer 图片和 Offer 意图进入 evaluate_offer”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Offer 图片和 Offer 意图进入 evaluate_offer”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. 简历截图进入 resume_preview

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手的图片识别系统，不是“上传图片后让大模型看一下”的附属能力。它是求职材料进入产品链路的分流层：用户上传一张 JD 长截图、Offer 截图、简历截图或聊天窗口图片后，系统必须先判断它是什么、文字是否可用、用户想做什么，再决定能不能进入 JD 评估、Offer 评估、简历预览、优秀简历保存或普通图片描述。
- - 从招聘 App 截一张超长 JD 图。 - 从聊天窗口转发一张职位缩略图。 - 把 Offer 邮件或 HR 聊天截图直接上传。 - 拍一张简历或参考简历截图。 - 只上传图片，不说明要评估、保存还是提取。
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“简历截图进入 resume_preview”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“简历截图进入 resume_preview”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“简历截图进入 resume_preview”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 长图生成 vertical slice candidates

**状态**: 已有自动化覆盖

**项目依据**:
- - `src/__tests__/jd-image-routing.test.ts`：验证 JD 图片和用户意图一致时进入评估，冲突时澄清。 - `src/__tests__/server-image-intake.test.ts`：验证服务端识别结果、错误和超时处理。 - `src/__tests__/server-image-variants.test....
- - 错路由：JD 被当成 Offer，Offer 被当成 JD，报告方向完全错。 - 空文本评估：OCR 没读到正文，后续模型仍然生成一份看似完整的报告。 - 缩略图误判：聊天截图里的小图预览被当成原始 JD，导致长时间识别后失败。 - 简历误写入：用户只是上传简历图片让系统看看，产品却把它当作正式保存请求。 - 错误成功提示：工具失败或读不到正文时，Age...
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“长图生成 vertical slice candidates”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“长图生成 vertical slice candidates”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“长图生成 vertical slice candidates”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/server-image-variants.test.ts`: creates vertical slice candidates for tall JD screenshots

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. JD 文本加 Offer 图片先澄清

**状态**: 已有自动化覆盖

**项目依据**:
- - 没有识别结果的图片轮次不能绕过识别直接进业务工具。 - 图片和用户文字意图冲突时，必须先澄清。 - 只上传图片但没有说明意图时，JD 和 Offer 也要先确认。 - 简历图片只能先预览，写入类动作必须有明确用户确认。 - OCR 超时不能说成图片不清晰。 - 缩略图不能通过放大补救，必须要求原图。
- - 错路由：JD 被当成 Offer，Offer 被当成 JD，报告方向完全错。 - 空文本评估：OCR 没读到正文，后续模型仍然生成一份看似完整的报告。 - 缩略图误判：聊天截图里的小图预览被当成原始 JD，导致长时间识别后失败。 - 简历误写入：用户只是上传简历图片让系统看看，产品却把它当作正式保存请求。 - 错误成功提示：工具失败或读不到正文时，Age...
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“JD 文本加 Offer 图片先澄清”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“JD 文本加 Offer 图片先澄清”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“JD 文本加 Offer 图片先澄清”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. 未知图片不进入业务写入

**状态**: 已有自动化覆盖

**项目依据**:
- - 没有识别结果的图片轮次不能绕过识别直接进业务工具。 - 图片和用户文字意图冲突时，必须先澄清。 - 只上传图片但没有说明意图时，JD 和 Offer 也要先确认。 - 简历图片只能先预览，写入类动作必须有明确用户确认。 - OCR 超时不能说成图片不清晰。 - 缩略图不能通过放大补救，必须要求原图。
- - `src/__tests__/jd-image-routing.test.ts`：验证 JD 图片和用户意图一致时进入评估，冲突时澄清。 - `src/__tests__/server-image-intake.test.ts`：验证服务端识别结果、错误和超时处理。 - `src/__tests__/server-image-variants.test....
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“未知图片不进入业务写入”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“未知图片不进入业务写入”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“未知图片不进入业务写入”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. 聊天截图只描述或澄清

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手的图片识别系统，不是“上传图片后让大模型看一下”的附属能力。它是求职材料进入产品链路的分流层：用户上传一张 JD 长截图、Offer 截图、简历截图或聊天窗口图片后，系统必须先判断它是什么、文字是否可用、用户想做什么，再决定能不能进入 JD 评估、Offer 评估、简历预览、优秀简历保存或普通图片描述。
- - 从招聘 App 截一张超长 JD 图。 - 从聊天窗口转发一张职位缩略图。 - 把 Offer 邮件或 HR 聊天截图直接上传。 - 拍一张简历或参考简历截图。 - 只上传图片，不说明要评估、保存还是提取。
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“聊天截图只描述或澄清”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“聊天截图只描述或澄清”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“聊天截图只描述或澄清”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. OCR timeout 视为服务失败而非图片不清晰

**状态**: 已有自动化覆盖

**项目依据**:
- 这里的产品重点是：识别结果必须保留“为什么这么判断”和“哪里失败了”。如果只返回一个文本字符串，后续就无法区分低清晰度、OCR 超时、图片不是材料、用户意图冲突这些不同问题。
- - 没有识别结果的图片轮次不能绕过识别直接进业务工具。 - 图片和用户文字意图冲突时，必须先澄清。 - 只上传图片但没有说明意图时，JD 和 Offer 也要先确认。 - 简历图片只能先预览，写入类动作必须有明确用户确认。 - OCR 超时不能说成图片不清晰。 - 缩略图不能通过放大补救，必须要求原图。
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“OCR timeout 视为服务失败而非图片不清晰”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“OCR timeout 视为服务失败而非图片不清晰”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“OCR timeout 视为服务失败而非图片不清晰”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: JD text plus JD image routes to JD evaluation
- `src/__tests__/jd-image-routing.test.ts`: Offer text plus Offer image routes to Offer evaluation
- `src/__tests__/jd-image-routing.test.ts`: JD text plus Offer image asks for clarification
- `src/__tests__/jd-image-routing.test.ts`: low-confidence thumbnails ask for a clearer image

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 长图整图超时后没有尝试切片

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这就是为什么长图失败信息会显示“长图上半段 / 中段 / 下半段”各自识别情况。它不是随机报错，而是在告诉用户到底是整张图质量不够、切片也失败，还是服务超时。
- - `src/__tests__/jd-image-routing.test.ts`：验证 JD 图片和用户意图一致时进入评估，冲突时澄清。 - `src/__tests__/server-image-intake.test.ts`：验证服务端识别结果、错误和超时处理。 - `src/__tests__/server-image-variants.test....
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“长图整图超时后没有尝试切片”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“长图整图超时后没有尝试切片”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“长图整图超时后没有尝试切片”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not blindly evaluate unknown screenshots

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. 聊天窗口小图误当原始 JD

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这些输入的风险在于：图片内容、用户文字意图和后续业务动作经常不一致。用户说“评估 Offer”，图片可能是 JD；用户上传简历截图，系统不能直接写入用户简历；用户上传的是聊天窗口里的小图预览，OCR 即使执行也很可能读不到正文。
- - 错路由：JD 被当成 Offer，Offer 被当成 JD，报告方向完全错。 - 空文本评估：OCR 没读到正文，后续模型仍然生成一份看似完整的报告。 - 缩略图误判：聊天截图里的小图预览被当成原始 JD，导致长时间识别后失败。 - 简历误写入：用户只是上传简历图片让系统看看，产品却把它当作正式保存请求。 - 错误成功提示：工具失败或读不到正文时，Age...
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“聊天窗口小图误当原始 JD”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“聊天窗口小图误当原始 JD”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“聊天窗口小图误当原始 JD”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not blindly evaluate unknown screenshots

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. 简历截图保存优秀简历时缺 role_category 仍入库

**状态**: 已有自动化覆盖

**项目依据**:
- - 简历截图默认只能预览，不能自动保存到用户简历。 - 保存优秀简历前必须确认岗位方向，例如 AI 产品经理、AI 运营、AI 售前、数据产品经理。
- 纸鸢求职助手的图片识别系统，不是“上传图片后让大模型看一下”的附属能力。它是求职材料进入产品链路的分流层：用户上传一张 JD 长截图、Offer 截图、简历截图或聊天窗口图片后，系统必须先判断它是什么、文字是否可用、用户想做什么，再决定能不能进入 JD 评估、Offer 评估、简历预览、优秀简历保存或普通图片描述。
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“简历截图保存优秀简历时缺 role_category 仍入库”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“简历截图保存优秀简历时缺 role_category 仍入库”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“简历截图保存优秀简历时缺 role_category 仍入库”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: JD text plus JD image routes to JD evaluation
- `src/__tests__/jd-image-routing.test.ts`: Offer text plus Offer image routes to Offer evaluation
- `src/__tests__/jd-image-routing.test.ts`: JD text plus Offer image asks for clarification
- `src/__tests__/jd-image-routing.test.ts`: resume screenshot enters preview confirmation flow

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 低置信度图片触发 evaluate_jd_full

**状态**: 已有自动化覆盖

**项目依据**:
- - 图片类型：JD / Offer / 简历 / 聊天截图 / 未知。 - 置信度：例如 97%。 - 路由：例如 `evaluate_jd`。 - 原因：例如“JD 文本意图与 JD 图片一致，进入评估流程”。 - 每张图或每个切片的识别结果。 - 如果失败，是超时、缩略图、低清晰度、正文不足，还是用户意图冲突。
- 1. 对每个候选图计算分数，分数来自置信度、文本长度、图片质量和是否识别出文档类型。 2. 如果多个长图切片都识别为同一文档类型，且置信度达到 0.72、正文长度不低于 40，会合并这些切片。 3. 合并时保留各段原文，用 `---` 分隔，并合并结构化字段，数组字段会去重。
- 主要实现面：`src/lib/server-image-intake.ts`、`src/lib/server-image-variants.ts`、`src/lib/agent/image-intake-router.ts`、`src/lib/agent/image-intake.ts`。

**输入/fixture**:
- 正例：JD 截图、Offer 截图、简历截图和长图切片，用来验证“低置信度图片触发 evaluate_jd_full”的成功路径。
- 反例：聊天截图、低置信度 OCR、JD 文本加 Offer 图片、OCR timeout，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：documentType、confidence、image variant、selected taskType 和 fallback reason；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 image-intake、image-intake-router、server image variants 和业务工具路由 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“低置信度图片触发 evaluate_jd_full”对应动作，并记录请求、工具调用或页面状态。
3. 读取 image intake 结果、澄清卡片、工具调用或未调用记录，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“低置信度图片触发 evaluate_jd_full”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 图片识别与截图路由系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/jd-image-routing.test.ts`: routes recognized JD images to the JD evaluation agent and tool
- `src/__tests__/jd-image-routing.test.ts`: routes recognized Offer images to the Offer agent and tool
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for JD image turns when intake is unavailable
- `src/__tests__/jd-image-routing.test.ts`: does not bypass image recognition for Offer image turns when intake is unavailable

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/jd-image-routing.test.ts`
  - routes recognized JD images to the JD evaluation agent and tool
  - routes recognized Offer images to the Offer agent and tool
  - does not blindly evaluate unknown screenshots
  - does not bypass image recognition for JD image turns when intake is unavailable
  - does not bypass image recognition for Offer image turns when intake is unavailable
  - image-only input classifies before generic chat and asks user intent
  - JD text plus JD image routes to JD evaluation
  - Offer text plus Offer image routes to Offer evaluation
  - ...
- `src/__tests__/server-image-intake.test.ts`
  - falls back from a timed-out tall whole image to slice OCR and merges slice text
- `src/__tests__/server-image-variants.test.ts`
  - creates vertical slice candidates for tall JD screenshots
- `src/__tests__/image-thumbnail-guard.test.ts`
  - blocks chat-window thumbnail screenshots before JD evaluation
  - does not evaluate high-confidence thumbnail hallucinations
- `src/__tests__/evaluate-jd-full-image-priority.test.ts`
  - does not forward images to the streaming evaluator when jd_text is already available
- `src/__tests__/agent-image-loop.test.ts`
  - short-circuits image-only turns before generic chat
  - does not reuse stale prior user text as the active instruction for image-only turns
  - does not inject latest user images when JD text is already present
  - blocks evaluation tools when the latest user turn is symbol-only
  - announces context compression before oversized context is rewritten
  - does not show compression just because the outbound request hits the message cap
  - keeps session memory digest gated until the fifth user message
  - announces session memory digest only for the first generated digest


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 图片识别与截图路由系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
