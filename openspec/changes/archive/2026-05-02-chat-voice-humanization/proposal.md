## Why

上一版 prompt 虽然加了情感感知层，但产出的回应像教科书情感支持范例——宣言式共情（"你信我一次"）、权限清单式安抚（"你可以X，可以Y，可以Z"）、过度表演"我在陪你"。真正的人不会这样说话。需要消除 AI 的"情感表演感"，让回应听起来像真人。

## What Changes

- 重写 stream route 的对话风格指南：消除宣言式、清单式、框架式的支持话术
- 核心原则：少即是多。短共情 > 长套话。回应具体内容 > 回应情绪标签

## Capabilities

### Modified Capabilities
- `chat-emotional-awareness`: 情感回应的风格规范从"支持框架"改为"真人对话感"

## Impact

- `frontend/src/app/api/chat/stream/route.ts` — SYSTEM_PROMPT 对话风格部分重写
