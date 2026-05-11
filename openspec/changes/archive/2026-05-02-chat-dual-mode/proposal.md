## Why

经过四轮 prompt 迭代，每一版都有不同的问题：治疗师腔 → 表演式共情 → 讨好卑微 → 审讯式追问。根因是我们试图用一个模式应对所有场景。

研究（Euphoria 开源项目、OpenAI 渐进式主动性框架）表明：优秀的情感陪伴 AI 使用**双模式切换**——日常 BASE 模式和深度 DEEP 模式，根据用户表达的信号强度自动调整回应力度。用户给一句模糊抱怨，回一句轻的。用户展开讲了细节，再往下挖。

## What Changes

- 重写 system prompt：引入 BASE ↔ DEEP 双模式概念
- 核心原则改为"匹配能量"：用户投入多少，你就回应多少
- 引入"渐进式主动性"：默认被动，只在明确叙事信号时才主动追问

## Capabilities

### Modified Capabilities
- `chat-emotional-awareness`: 从单模套所有场景改为 BASE/DEEP 双模自适应

## Impact

- `frontend/src/app/api/chat/stream/route.ts` — SYSTEM_PROMPT
