# Design: CV AI 优化 — 四维评判模型与交互升级

## Context

当前 `optimize-section` API 使用双滑条参数（aggressiveness 1-10, keywordDensity 1-10），但在 prompt 构建中仅映射为 3 档。前端 OptimizePanel 使用连续 range input 给用户 10 级假象，实际后端无法区分。Prompt 中「不编造事实」的安全约束过于绝对，导致 AI 输出始终保守。模型 `deepseek-v4-flash` 轻量级参数限制了复杂改写能力。

设计目标：参考 Cursor Effort 控制、Grammarly 信号设计、Teal XX 占位符、Notion 离散操作等优秀产品策略，构建一个用户可感知分层、AI 大胆提案+用户把关的协作式优化体验。

## Goals / Non-Goals

**Goals:**
- 用户调节 Effort 1-5 时，输出内容有肉眼可见的改写深度差异
- AI 通过 XX 占位符大胆推断量化维度，但不编造具体数字
- 追问模式提供交互式信息补充路径，不阻塞主流程
- Operation 按钮明确约束 AI 行为边界，不被 JD/Reference 覆盖
- JD 作为内容滤网决定重点，Reference 作为风格范本决定笔法

**Non-Goals:**
- 不引入流式响应（优化内容量适合一次性返回）
- 不改动 CV 版本管理、PDF 生成、ATS 评分等其他模块
- 不改变 OptimizePanel 的展开/收起动画和 AnimatePresence 框架
- 不引入批量优化（一次只优化一个 section）

## Decisions

### Decision 1: Operation 用离散按钮而非下拉菜单

**选型**：4 个独立按钮（全面优化/STAR重组/量化增强/关键词注入），单选，默认「全面优化」选中。

**理由**：Notion AI 已验证离散操作按钮比连续参数更直观。用户不需要理解「激进程度 6 是什么意思」，只需要知道自己「想让 AI 帮我量化」还是「帮我重组 STAR」。

**备选方案（已否）**：保留滑条但增加标注。问题在于滑条本质是模拟量控制，改写策略的差异更适合离散表达。

### Decision 2: Effort 用 5 档单选而非连续滑条

**选型**：5 个点选按钮，标签为「温和/保守/适中/大刀/重写」，默认「适中」。

**理由**：Cursor 的 Low/Medium/High 三档已被验证有效，但简历改写的需求范围更宽。5 档在认知负荷和精细度之间取得平衡。每档对应独立的 prompt 分支，确保用户感知到差异。

### Decision 3: XX 占位符格式

**选型**：`[XX]` 或 `[XX: 推断说明]` 占位符，渲染时黄色高亮背景，点击进入行内编辑。

**理由**：Teal 的 XX 占位符策略已被市场验证——既不编造数据，又不让简历显得空洞。用户替换占位符时无需切换上下文。

### Decision 4: 追问模式为可选项，不阻断主流程

**选型**：Effort 4-5 时在面板底部显示追问开关 checkbox，用户可选择开启。开启后先生成追问卡片，用户可跳过直接出方案。

**理由**：追问增加交互步数，应作为高级选项而非默认行为。Grammarly 的核心理念是「信号不强制」——给出选项但不强迫使用。

### Decision 5: JD ≈ Reference 平级，冲突时 JD 优先

**选型**：两者在 prompt 中被称为同级协作关系。当 Reference 的风格与 JD 的内容基调矛盾时，内容走 JD、表达走 Reference 的可迁移部分。

**理由**：JD 决定的是内容相关性（找工作的靶子），Reference 决定的是表达质量（怎么写得好）。内容准确性 > 表达美感。

### Decision 6: Temperature 按 Effort 动态调整

**选型**：
- Effort 1-2: Temperature 0.3（保守稳定，润色为主）
- Effort 3:   Temperature 0.7（适度创意）
- Effort 4-5: Temperature 0.9（大胆发挥，占位推断）

**理由**：低温对应低强度改写（润色不需要创意），高温对应高强度改写（推断量化需要 AI 发散）。单次 API 调用的 temperature 根据单次请求的 effort 值确定。

### Decision 7: 方案数量调整

**选型**：有 JD → 2 个方案（方案 A 定向 = Operation × JD × Reference × Effort；方案 B 通用 = Operation × Reference × Effort）；无 JD → 1 个方案。

**理由**：当前 3 方案中有 JD 时才出方案 C，本质是 2 或 3 方案。调整为定向 vs 通用对照更清晰，减少用户决策负担。无 JD 时不需要对照。

## Risks / Trade-offs

- **[风险] XX 占位符可能让部分用户困惑** → 首次使用时显示 tooltip 指引，且 XX 占位符机制可关闭
- **[风险] Effort 5 的大胆推断可能产生不合理的量化推测** → 占位符标注推断依据（如 `[XX: 行业参考 10k+]`），用户可一键拒绝
- **[风险] 追问模式可能被用户感知为「AI 在推卸责任」** → 追问文案设计为邀请式（「为了让优化效果更好」），且跳过按钮醒目
- **[风险] 模型升级到 deepseek-v4-pro 增加 API 成本和延迟** → pro 模型的额外推理能力对应 5-8 秒生成时间（vs flash 的 2-3 秒），在 UI 上用更丰富的 loading 状态缓解等待感
- **[取舍] 放弃连续滑条失去「微调」的自由度** → 收获的是每档之间明确的感知差异。5 档对简历改写场景足够
