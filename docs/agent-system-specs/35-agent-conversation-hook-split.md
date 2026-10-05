# Spec 35: Agent Conversation Hook Split(会话 hook 拆分,B6)

Target label: `ready-for-agent`
Depends on: 2026-09 C2(useAgentConversation 从 page.tsx 下沉)既有交付与「纯 hook 不用 zustand」决策;批次 0.21.0,建议先于 spec 33 施工

## Problem

`src/components/agent/use-agent-conversation.tsx` 是 **2346 行单 hook、24 个 useState**,9 月以来改动第 6 热的文件(14 次)——agent 前端状态的事实巨石。2026-09 把它从 2434 行的 page.tsx 拆出来是第一步,但它自己成了新的堆料目标;spec 33 信任卡换装必然再动它,不先拆就会在巨石上继续堆。

## Solution

**先补源码契约测试锁行为,再按三个关注面拆**(grilling Q9):

1. **服务端投影解析**:`parseServerSession`/`projectDurableInterviewEngineState` 调用与 scoreArtifacts 包装层——纯函数化,输入 durable 形状输出视图模型。
2. **会话生命周期**:发送、续跑、Gate/批准、Run 状态推进——保留为 hook 主干。
3. **界面状态**:折叠、rail、滚动、选中态等纯 UI state——拆成独立小 hook 或下放组件。

拆完后 `use-agent-conversation.tsx` 保留为**组合门面**(导出签名不变,页面零改动),内部三个模块各自 ≤800 行。不引入状态库(0.09 已定:纯 hook 不用 zustand)。

## User Stories

- 无用户可见变化;后续每个前端改动只碰自己那个切面,回归面从 2346 行缩小到对应模块。

## Implementation Decisions

- **机械拆分纪律**(0.12 事故教训):拆分前清洗 `\r`(CRLF 污染曾致 25+1 个返回标识符列表受污染、模板多加逗号);用脚本/AST 辅助移动,不手工剪切粘贴大段。
- 契约测试先行:拆分前锁定 parseServerSession 的输入输出样例(durable 形状→视图模型的金样本)、发送/续跑状态序列;拆分以「测试不改一字全绿」为验收。
- 模块间通信只经显式参数/返回值,不建共享可变单例。

## Testing Decisions

- 新增 `use-agent-conversation` 契约测试文件(金样本+状态序列)先于拆分合入并绿;拆分 PR 中该文件零改动。
- 既有 agent 前端测试(含 0.12 源码契约测试)全绿;tsc 0 新错。

## Out of Scope

- page.tsx 或其他页面的进一步拆分;状态库引入;AgentDomainCards.tsx(1898 行)的拆分(仅随 spec 34 迁浮层)。

## Further Notes

- 与 spec 33 的施工顺序:35 → 33。若 33 先行,须把「不在 hook 内新增跨关注面状态」作为临时纪律。
- 预估 1-2 天:契约测试半天,拆分一天。
