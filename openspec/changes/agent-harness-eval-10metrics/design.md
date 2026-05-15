## Context

Agent 10 项指标全景不达标。核心矛盾：Harness 职责（错误处理、上下文管理）推给 LLM prompt，LLM 职责（工具选择、参数构建）用 prompt 规则硬约束。导致 prompt 膨胀到 60+ 条规则，LLM 指令遵循衰减。

## Goals / Non-Goals

**Goals:**
- 10 项指标全部达到或接近目标水平
- 建 eval framework 实现数据驱动迭代
- Harness/LLM 职责明确分离
- Prompt 从 120 行砍到 50 行

**Non-Goals:**
- 不改 maxIterations
- 不改 UI
- 不换模型

## Decisions

### 1. capToolCtx 硬截断

当前 600 字符截断后还追加提示。改为：纯截断，不追加，LLM 永远看不到超出部分。

### 2. matchHints 而非硬路由

代码给关键词偏置，LLM 保留选择权。过度路由会失去灵活性。

### 3. Prompt 精简策略

凡是代码能做的规则，从 prompt 删除。保留的只有 LLM 专属推理需要的内容。

### 4. Eval 双模式

mock 测 harness（零成本秒级），live 抽样验证 LLM 行为。Google/Anthropic 标准做法。
