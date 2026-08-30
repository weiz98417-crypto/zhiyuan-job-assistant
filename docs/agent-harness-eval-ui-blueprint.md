# Agent Harness、评测体系与 `/agent` UI 改造蓝图

状态：Phase 1-4 的核心运行时、投影、Eval Run 存储和 `/agent` 活动轨道已落地；staging Judge、thinking-orbs 原包和完整浏览器矩阵仍按阶段推进。本文同时作为目标架构与已落地边界说明。

已落地入口：`/api/admin/agent-evals` 提供受控 Eval Run 元数据读写，`/api/admin/agent-evidence/:runId` 提供管理员脱敏 Evidence/用户 Safe View parity；`runDeterministicJourney` 通过 adapter seam 穿透 route/runtime/store/projection/read-back 边界。

## 1. 背景与项目事实

项目当前定义了 11 类 `AgentTaskType`，并已有路由、Run Contract、工具治理、Durable Worker、Checkpoint、Run Evidence、Review 和 Eval Candidate 等基础设施。现有 `agent-task-runtime.e2e.test.ts` 通过固定 `orchestrate` 事件验证路由、合同门禁、Worker 引擎和会话投影，因此能证明运行时闭环，却不能证明真实模型完成 JD 分析、简历诊断修改、Offer 判断或跨任务旅程的质量。

当前 `/agent` 还存在两个结构性问题：

1. 发送消息时先插入空 Assistant 占位；工具消息插入后，最终 Assistant 无法替换该占位，形成空气泡。
2. 工具缺少 `uiPayload` 时会回退展示 `event.result`；`self_positioning` 等 legacy 工具因此把 Skill 内部引导文本作为用户内容显示。

项目已有 `llmSummary + uiPayload + rawData` 三管线方向和 Durable UI projection，但本地直跑、持久会话和页面渲染尚未统一消费同一安全投影。

## 2. 目标

- 证明 11 类原子任务的运行正确性与业务质量，而不只证明 mock 事件能闭环。
- 用合法任务转换图覆盖所有节点、所有转换边、所有二步路径和有界核心长旅程。
- 支持补充输入、暂停、切换、取消、刷新恢复和跨页面恢复，且不污染 Run Context。
- 普通用户看到简洁状态、安全推理摘要、结构化结果和必要确认；Admin 能查看完整 Evidence。
- 消除空泡、重复消息、无内容布局间距以及 Skill/Tool 原文泄漏。
- 保留纸鸢品牌，用 Ant Design 基础件与 thinking-orbs 提升 `/agent` 的交互和视觉完成度。
- 让确定性 E2E、staging 真实模型评测和浏览器 E2E 使用同一事件协议、fixture 和 Artifact 引用。

## 3. 非目标

- 不穷举产品上不合法的 11 类任务数学排列。
- 不允许多个 active Run 在同一聊天区交错输出。
- 不向普通用户展示 raw chain-of-thought、系统提示词、Skill 正文、工具参数或原始 JSON。
- 不使用 LLM Judge 覆盖权限、读回、协议或数据归属失败。
- 不在第一阶段全站替换 UI，也不采用 Ant Design 默认蓝色后台皮肤。
- 不搬入完整 Codex 或 DeepSeek Harness。

## 4. 目标架构

```text
Durable Run Event Log
        │
        ├── Run Context Builder ───────────────→ Model Context
        │
        ├── Evidence Projector ────────────────→ Admin / Eval
        │
        └── Conversation Assembler
                │
                ├── Activity Store ────────────→ Orb + 状态 + 安全摘要
                ├── Transcript Store ──────────→ Assistant / Safe Tool View
                ├── Approval Store ────────────→ Run Gate UI
                └── Hidden Nodes ──────────────→ 不渲染
```

运行事件是事实源；聊天消息、状态轨道和 Admin 证据都是独立投影。React 组件不再解释原始工具结果，也不负责把 SSE 事件猜成业务语义。

## 5. Item 生命周期与 Surface Event

借鉴 Codex，把 Turn 内对象拆成稳定 Item：

- `assistant_message`
- `reasoning_summary`
- `plan`
- `tool_attempt`
- `approval`
- `artifact`
- `run_error`

每个 Item 使用稳定 `itemId` 和统一生命周期：

```text
started → delta* → completed | interrupted | failed | hidden
```

建议的用户界面事件：

```ts
type AgentSurfaceEvent =
  | { type: "progress"; runId: string; phase: AgentPhase; label: string; orbState?: OrbState }
  | { type: "assistant_delta"; runId: string; itemId: string; delta: string }
  | { type: "assistant_final"; runId: string; itemId: string; content: string; artifacts: ArtifactRef[] }
  | { type: "reasoning_summary"; runId: string; itemId: string; summary: string; status: ItemStatus }
  | { type: "tool_status"; runId: string; itemId: string; label: string; status: ToolStatus }
  | { type: "tool_view"; runId: string; itemId: string; view: UserSafeToolView }
  | { type: "approval"; runId: string; itemId: string; request: ApprovalView }
  | { type: "run_error"; runId: string; itemId: string; message: string; recoverable: boolean };
```

强制规则：

- 首个非空 Assistant delta 到达时才 materialize 响应槽位。
- 同一 `itemId` 的 delta 只更新同一节点。
- final 文本为空且没有 Artifact/Approval 时删除临时槽位。
- 中断时有正文则保留并标记 interrupted；无正文则只显示恢复状态。
- `progress`、`tool_status` 不进入 transcript。
- 可见节点在 Conversation Assembler 阶段决定，不在 JSX map 后 `return null`。
- 普通用户接口只返回 safe/summary 投影；full Evidence 使用独立管理员接口和权限。

## 6. Tool 与 Skill 安全呈现协议

将现有三管线扩展为带受众和降级行为的安全协议：

```ts
interface ToolPresentation {
  llmSummary: string;
  uiPayload: SafeCardPayload | null;
  rawData: unknown;
  visibility: "silent" | "progress" | "card" | "approval";
  safeFallback?: string;
}
```

用户侧联合类型：

```ts
type UserSafeToolView =
  | { kind: "progress"; label: string; state: ToolStatus }
  | { kind: "card"; card: SafeCardPayload }
  | { kind: "approval"; request: ApprovalView }
  | { kind: "error"; message: string; recoverable: boolean }
  | { kind: "silent"; reason: "internal" | "no_user_value" };
```

所有 11 类任务都必须定义 `Agent 安全视图`，但不要求都制作复杂卡片：

- JD、Offer、简历文档/草稿/提案、岗位发现、导出使用结构化卡片。
- 普通问答、简历查询使用安全文本。
- 职业定位和面试使用阶段卡、上下文条和安全文本。
- Profile 写入使用候选信号、确认和读回结果视图。
- 没有安全视图时静默或显示明确声明的 `safeFallback`，禁止 `event.result` fallback。

安全推理摘要允许显示：当前阶段、当前目标、使用的材料类型与版本、完成的验证、等待用户的原因。摘要由服务端模板优先生成；模型候选摘要必须经过长度、敏感字段和内部指令过滤，失败时退回固定文案。

## 7. 合法任务转换图

转换图成为路由、Run 编排、UI 和 E2E 的共享领域契约。建议结构：

```ts
interface TaskTransitionRule {
  from: AgentTaskType;
  to: AgentTaskType;
  requiredArtifacts: ArtifactKind[];
  forwardedArtifacts: ArtifactKind[];
  confirmation: "none" | "context" | "write";
  previousRun: "complete" | "pause";
  guards: TransitionGuard[];
}
```

第一版至少覆盖以下业务簇：

| 起点 | 合法后续 |
| --- | --- |
| 职业定位 | 画像更新、岗位发现、简历诊断 |
| 岗位发现 | JD 分析、投递跟踪 |
| JD 分析 | 简历诊断、简历修改、面试准备、文件导出 |
| 简历查询/诊断 | 简历修改、JD 分析、面试准备、文件导出 |
| 简历修改 | JD 再评估、面试准备、文件导出 |
| 面试准备 | 继续面试、投递跟踪 |
| Offer 分析 | Offer 对比、谈判策略、HR 问题、文件导出 |
| Profile 更新 | 岗位发现、JD 分析、简历诊断 |

实施前必须从工具能力和产品规则补齐完整邻接表；模型不能绕过图自由改变任务。

## 8. Run 切换、输入和 Artifact 语义

- 一个明确用户目标对应一个 Agent Run。
- 补充当前目标的信息提交到同一非终态 Run。
- 明确暂停或切换时，旧 Run 进入 `paused`；新目标在同一 Conversation 创建新 Run。
- 明确取消进入 `cancelled`，不可自动恢复。
- 同一 Conversation 默认只有一个 active Run。
- 状态轨道和自然语言指令都调用同一个暂停、切换、取消状态机。
- 写入、应用修改、发送和导出继续使用有范围的 Run Gate。

跨任务引用使用稳定 Artifact 快照：

```text
JD: jdId + jdHash
Resume: resumeVersion + resumeHash
Offer: offerReportId + snapshotHash
Report/Draft: artifactId + variant/version + hash
```

只读 Artifact 默认自动传递并在“当前上下文”条中可见、可替换；写入前再次确认。哈希或版本变化时标记 stale，暂停依赖旧版本的写入步骤并要求用户确认。

## 9. 评测分层

### L0：静态合同与 Schema

- Event、Surface Event、Safe View、Transition Graph schema。
- 每个任务的工具白名单、风险和批准规则。
- 禁止 raw result fallback。

### L1：确定性组件与运行时测试

- 路由、Run Contract、Worker、Checkpoint、Gate、Evidence、读回。
- Item 生命周期、delta/final、幂等 cursor、空内容抑制。
- 所有任务节点、所有合法转换边、所有合法二步路径。

### L2：确定性业务旅程 E2E

- 使用真实服务边界和可控 fake model/tool adapter，不注入最终成功状态。
- 覆盖 Artifact 传递、暂停、切换、恢复、stale、批准和失败回滚。
- 核心旅程使用 4–6 步有界路径；循环设置最大深度。

### L3：staging 真实模型 Eval

- 固定模型 ID、提示词版本、工具版本、fixture 版本和参数。
- 真实模型输出由独立固定 Judge 按任务 rubric 评分。
- 模型升级创建对照 benchmark，不覆盖旧基线。

### L4：浏览器与视觉 E2E

- Playwright 驱动真实 `/agent` 入口。
- 验证空泡、重复消息、Skill 泄漏、状态轨道、审批、刷新恢复和卡片行为。
- Chromium 桌面、约 768px、约 390px；浅色、深色、reduced-motion、键盘和 ARIA。
- 视觉截图辅助发现回归，DOM/协议断言负责判断正确性。

### L5：人工抽检

- 发布前复核核心样本和 Judge 分歧样本。
- 线上失败通过 Review 晋升为 Eval Candidate，再经审核进入回归集。

## 10. 评测样本与 Judge

第一阶段使用结构化模板、程序化事实和人工维护的关键期望：

- 模型可以生成自然语言表面变化。
- 姓名、手机号、邮箱、公司、金额和日期使用程序化假值。
- 固定事实、数字、时间、风险标签、Artifact 哈希和预期写入结果由 fixture 明确定义。
- 包含缺字段、低清 OCR、冲突材料、Prompt Injection、跨用户引用和隐私泄漏样本。
- 后续脱敏真实样本必须经过人工确认和访问控制。

通用质量维度采用 0–4 分：

- 事实保真
- 完整性
- 任务相关性
- 可执行性
- 风险披露
- 表达质量

任务专属维度追加到各自 rubric。初始一票否决：

- JD：虚构岗位事实、遗漏重大风险、引用错误简历证据。
- 简历：虚构经历/数字、破坏原始事实、未经批准写入。
- Offer：遗漏重大合同/薪酬风险、把缺失信息当确定事实、错误引用条款。

Judge 使用独立固定模型，不知道候选输出来源；它可以评分和提出阈值候选，但不能推翻确定性失败。阈值经固定校准集验证和显式批准后冻结，后续变更只能形成提案。

## 11. Eval Run 与发布门禁

每次 Eval Run 保存：

- 代码 commit
- 模型、提示词、工具、Transition Graph、fixture 和 Judge 版本
- 每个样本的确定性门禁、质量分、Judge 理由和脱敏证据
- Artifact 引用、Run/Event/Tool Attempt 标识
- 基础设施失败、模型质量失败和重试历史
- 对应 Review/Eval Candidate 链接

运行频率：

| 时机 | 内容 |
| --- | --- |
| PR | 确定性全量 + 关键旅程 smoke |
| 夜间 | 每个原子任务约 10 个合成样本；核心组合旅程各约 5 个 |
| 发布前 | 完整 benchmark + Judge 分歧和失败样本人工抽检 |

重试规则：基础设施超时、网络或限流允许最多两次有限重试，保留首次失败并标记 flaky；模型质量失败不通过自动重跑掩盖。硬安全门禁零容忍；质量按每类任务单独达标，不能用全局平均掩盖短板；关键旅程不得存在 P0/P1 失败。

## 12. `/agent` UI 目标

第一阶段只改 `/agent` 垂直切片，验收重点是聊天可读性、过程状态和结果卡层级。

### 状态轨道

- 默认显示 thinking orb、一行当前安全摘要和耗时。
- 历史摘要折叠为可展开步骤轨迹。
- 显示暂停、取消、恢复和切换任务入口。
- 等待确认时使用明确 Approval 节点，不伪装成 Assistant 文本。

建议 Orb 映射：

| 运行语义 | Orb | 文案示例 |
| --- | --- | --- |
| 理解/分析 | `solving` | 正在理解你的目标 |
| 查找/读取 | `searching` | 正在查找相关信息 |
| 工具执行 | `working` | 正在处理材料 |
| 校验/读回 | `connecting` | 正在核对结果 |
| 等待用户 | `listening` | 等你确认下一步 |

### 上下文与结果

- Run 顶部显示 JD、简历、Offer 等当前 Artifact 和版本。
- 可替换或解除只读引用。
- 结果卡标记输入 Artifact 版本和读回状态。
- stale 时使用 Alert/Approval 阻断写入。
- 普通用户只看到 Safe View；Admin Debug Drawer 读取独立 full Evidence API。

### 组件职责

- Ant Design：Input、Button、Modal、Drawer、Progress、Collapse、Tabs、Alert 等基础交互和无障碍能力。
- 纸鸢设计层：颜色、字体、圆角、消息布局、卡片层级、上下文条和状态轨道。
- `thinking-orbs`：封装为 `AgentActivityIndicator`，只消费纸鸢状态枚举。
- Framer Motion：页面编排和状态过渡。

## 13. 开源复用边界

研究依据见 `docs/research/open-source-agent-harnesses.md`。

### DeepSeek Harness：允许按需移植

- Event Registry 与 Conversation Assembler 的 TypeScript 骨架。
- visible/hidden node 与 `hasVisibleContent` 规则。
- Tool Presentation Intent 联合类型和渲染注册机制。
- ReasoningRow 的折叠交互结构。
- 单一持久事件源和幂等组装思想。

移植时必须删除 raw-result fallback，并适配纸鸢的 Run、Gate、Artifact 和权限语义。

### Codex：以 TypeScript 适配协议

- Thread/Turn/Item 生命周期。
- Item started/delta/completed/interrupted/failed。
- Reasoning Summary 与 Raw Reasoning 分离。
- summary/full 两级读取。
- Plan 与 Approval 独立 Item。
- 空 stream tail 和空最终文本清理规则。

不复制 Rust TUI、Shell 权限和开发者终端 UI。

### thinking-orbs：直接依赖并封装

- 使用 MIT 包。
- 封装中文标签、主题、尺寸、reduced-motion 和状态映射。
- 不让业务组件直接散落第三方状态字符串。

复制实质实现时保留相应 LICENSE、NOTICE、版权、修改说明和来源 commit；没有复制前不提前添加无关声明。

## 14. 旧消息兼容

- 不批量重写历史 `AgentMessage` 数据。
- 旧消息通过 Legacy Conversation Adapter 进入新 Assembler。
- legacy `toolResult.result` 不得进入普通用户 Safe View。
- 新 Run 只写新协议和 Item 标识。
- 对旧会话提供安全投影重建，不把 rawData 回填到 transcript。
- 在旧/新协议并存期间固定历史恢复、顺序、空消息和泄漏回归用例。

## 15. 首条垂直切片

首条组合旅程：

```text
JD 分析
  → 简历诊断
  → 简历修改提案
  → 用户批准
  → 原子应用
  → CV 读回验证
```

必须同时证明：

1. JD 报告与简历版本以 Artifact 引用传递。
2. 每个目标使用独立 Run，并在同一 Conversation 串联。
3. 用户可在执行中补充、暂停、切换、恢复或取消。
4. 修改提案不会未经批准写入。
5. Artifact 变化触发 stale，而不是静默使用最新内容。
6. 用户 UI 无空泡、无原始工具/Skill 文本。
7. Orb、摘要、步骤轨迹和结果卡使用同一 Surface Event。
8. Admin 可以查看 Run Evidence、Tool Attempt、Gate、Artifact、Judge 和读回证明。
9. 同一 fixture 可运行确定性 E2E 与 staging 真实模型 Eval。
10. 刷新或跨页面后恢复原 Run，不重复执行写入。

## 16. 实施阶段

### Phase 0：合同与样本

- 定义 Item、Surface Event、Safe View、Artifact Ref、Transition Rule schema。
- 建立合成 fixture 格式和首批核心任务样本。
- 固定空泡、Skill 泄漏和 legacy 消息回归测试。

### Phase 1：Harness 投影层

- 引入 Event Registry、Conversation Assembler 和可见性规则。
- 将 Activity、Transcript、Approval、Evidence 投影分离。
- 取消 `event.result` 用户侧 fallback。
- 统一本地 runner 与 Durable Worker 的 UI projection。

### Phase 2：Run 组合语义

- 实现 Transition Graph 与 Artifact Ref。
- 增加 `paused`、切换、恢复和输入意图处理。
- 让按钮与自然语言走同一状态机。

### Phase 3：`/agent` 垂直 UI

- 接入 Ant Design provider 与纸鸢主题映射。
- 安装并封装 thinking-orbs。
- 重构消息、状态轨道、上下文条、Safe Tool View、Approval 和 Admin Debug Drawer。
- 完成响应式、深色、reduced-motion、键盘和 ARIA。

### Phase 4：Eval Run

- 实现确定性路径生成器与 Journey Runner。
- 实现 staging 模型 adapter、独立 Judge 和 Eval Run 存储。
- 接入 Review/Eval Candidate 和 Admin 评测趋势。

### Phase 5：扩展与迁移

- 按 11 类任务补齐全部 Safe View 和 rubric。
- 覆盖所有合法边、二步路径和有界长旅程。
- 把失败样本持续晋升为回归集。
- `/agent` 验证稳定后再把视觉语言扩展到全站。

## 17. 第一阶段 Definition of Done

- 11 类任务均有 Safe View 合同，缺少安全投影时 fail-closed。
- 普通用户 DOM、会话 API 和网络投影中不可见 Skill 正文、rawData、工具参数和原始推理。
- 没有空 Assistant bubble、只有 tool-call 的 Assistant shell、`return null` 布局间距或重复流式消息。
- 首条 JD→简历诊断→修改提案→批准应用旅程可暂停、切换、恢复和回放。
- 写入绑定准确 Gate、Artifact 版本和 read-back proof。
- 普通用户 Safe View 与 Admin full Evidence 来自同一 Run Event Log。
- 节点、合法边、二步路径和首条长旅程均有确定性 E2E。
- staging 真实模型 Eval 固定版本并由独立 Judge 评分。
- Eval Run 可回放 fixture、版本、事件、门禁、评分和失败原因。
- `/agent` 通过桌面、平板、手机、浅色、深色、reduced-motion、键盘和 ARIA 验收。
- 开源实质代码复用满足对应许可证和来源记录要求。

## 18. 验证命令目标

实施后应提供清晰的分层命令，命名可在落地时调整：

```text
npm run test
npm run e2e:agent-tasks
npm run e2e:agent-journeys
npm run e2e:agent-ui
npm run eval:agent-staging
npm run eval:agent-release
```

PR 默认不执行完整真实模型 benchmark；夜间和发布流水线使用专用 staging 凭据、固定预算和脱敏数据。
