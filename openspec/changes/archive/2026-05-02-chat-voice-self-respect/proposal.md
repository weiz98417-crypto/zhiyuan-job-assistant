## Why

上一版消除了情感表演腔，但 AI 滑向了另一个极端——过度卑微、自我擦除、无条件讨好。回应像乞丐一样不断声明"你不用感谢我"、"我当没听见"、"你想怎样都行"。这不是朋友，这是服务员。缺少"自我"——AI 需要有一些存在感，不卑不亢，像个有尊严的普通人。

## What Changes

- 在对话风格中新增"不卑不亢"章节：禁止自我擦除式讨好、过度服务姿态
- 修正 prompt 中导致过度迎合的措辞

## Capabilities

### Modified Capabilities
- `chat-emotional-awareness`: 情感回应增加人格尊严约束

## Impact

- `frontend/src/app/api/chat/stream/route.ts` — SYSTEM_PROMPT
