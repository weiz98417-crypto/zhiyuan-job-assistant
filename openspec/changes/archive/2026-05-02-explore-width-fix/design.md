## Context

explore 页面在上一轮改造中使用了 `flex justify-center` + `max-w-2xl` 包裹对话区（ChatGPT 模式），但项目其他页面（evaluate, cv, jds, reports）均采用 Perplexity 模式——内容左对齐填满 AppShell 可用宽度。这导致 explore 页面与其他页面视觉不一致，在大屏上浪费大量水平空间。

## Goals / Non-Goals

**Goals:**
- 对话区填满面板左侧的全部可用宽度（1920px 下约 1312px）
- 与其他页面保持一致的"填满可用空间"布局策略
- 消息气泡保持合理阅读宽度（max-w-[90%]）

**Non-Goals:**
- 不改变面板（384px 持久可见）
- 不改变空状态 prompt chips
- 不改变字体体系

## Decisions

### Decision 1: 去除居中包裹，对话区直接 flex-1

```
当前:
<div className="flex-1 flex justify-center min-w-0 overflow-hidden">
  <div className="max-w-2xl w-full flex flex-col min-h-0">
    ...
  </div>
</div>

改为:
<div className="flex-1 flex flex-col min-w-0">
  ...
</div>
```

**Why**: 项目全局采用流体布局（AppShell 无 max-width），所有页面填满可用空间。explore 页面的对话区不应例外。消息气泡的 max-w-[90%] 确保在宽列中仍可舒适阅读，类似 Perplexity 的做法。

### Decision 2: 消息气泡保持 max-w-[90%]

在 1312px 宽度的对话区中，90% 气泡宽度约 1180px，中文约 75-80 字/行。对 AI 对话场景可接受——用户消息通常较短，AI 消息通过 natural line breaks 自然换行。如需进一步约束可在后续迭代中调整。
