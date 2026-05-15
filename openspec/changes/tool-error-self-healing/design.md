## Context

工具错误 → LLM 循环 → 崩溃的根因是两个问题叠加：
1. 工具永久错误不含可用资源线索 → LLM 不知道怎么纠正 → 试别的工具
2. degradeToUser 后循环仍允许 LLM 调工具 → 乱闪

Claude Code 的做法是在每个工具失败时返回结构化纠正信息，把错误变成发现机制。

## Goals / Non-Goals

**Goals:**
- `read_file` 的 permanent 错误告诉 LLM 当前可用的资源（"我的简历"、参考简历列表、项目文件）
- `get_report_detail` 的错误告诉 LLM 最近报告编号
- `degradeToUser` 后强制下一轮禁止工具调用
- Agent 系统提示词注入可用资源摘要（减少 LLM 首次猜错的概率）

**Non-Goals:**
- 不改 ToolResult 类型
- 不加新工具
- 不改 agent loop 的 ReAct 结构

## Decisions

### D1: 工具错误中嵌入可用资源，而非单独加发现工具

**选择**：在 `read_file` 的 permanent 错误分支中查询 `/api/cv/data` 和 `/api/cv/references`，返回可用资源列表。

**理由**：Cursor 的"搜索→发现→读取"三层模式适合面对数百个文件的项目。本项目的资源类型固定（简历、参考简历、报告），错误中直接列出即可。

### D2: degradeToUser 后禁止工具调用

**选择**：在 `[TOOL_ERROR]` 消息末尾追加 `"禁止调用任何工具。你必须在下一轮直接输出文字回复。"`。

**理由**：degradeToUser 的本意是让 LLM 告知用户发生了什么。但当前实现允许 LLM 继续调工具，导致循环。一行提示词约束解决问题。

### D3: 系统提示词注入可用资源

**选择**：resume agent 启动时在系统提示词中注入 `"当前可用: 你的简历(read_file path='我的简历'), 参考简历: #1 张雯茜"`。

**理由**：减少 LLM 首次猜错的概率。资源不多（<300 chars），不会造成上下文压力。

## Risks / Trade-offs

- **[风险] Agent 提示里注入的资源可能过时** → 每次 Agent 启动时实时查询
