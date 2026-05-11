## Why

虽然前几版消除了表演式词汇，但 AI 的底层 stance 仍是"治疗师模式"——投射情绪、宣布陪伴、给空间。每一句单看都没毛病，合在一起就是踮着脚尖走路的窒息感。真正的人不会"给用户空间"——他们会好奇地问"什么比赛？""输给谁了？""怎么输的？"

根源：prompt 一直在教 AI "如何正确地回应情绪"，而不是"如何像一个活人一样对对方说的事产生好奇"。

## What Changes

- 重写 prompt 核心逻辑：从"情绪回应框架"转为"好奇心驱动对话"
- 核心原则：对内容产生好奇 > 对情绪进行标注
- 添加问题型回应 vs 治疗型回应的对照示例

## Capabilities

### Modified Capabilities
- `chat-emotional-awareness`: 底层 stance 从治疗师模式转为好奇朋友模式

## Impact

- `frontend/src/app/api/chat/stream/route.ts` — SYSTEM_PROMPT 重写
