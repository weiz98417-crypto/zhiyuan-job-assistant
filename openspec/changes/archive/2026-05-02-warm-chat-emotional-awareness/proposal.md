## Why

当前聊天 system prompt 是纯工具导向的访谈框架。用户情绪低落时，AI 仍然机械推进"经验→技能→偏好→约束"流水线，句中不断提及"工作"二字，显得冷漠甚至让人烦躁。求职本身伴随焦虑、自我怀疑、压力——聊天体验必须能感知并承接这些情绪，先做情感陪伴，再谈方向探索。

## What Changes

- 重写 `/api/chat/stream/route.ts` 的 SYSTEM_PROMPT：增加情感感知层，注入情绪识别与陪伴话术指南
- 核心原则：先共情，后探索；用户情绪低落时，暂停推进访谈框架

## Capabilities

### New Capabilities
- `chat-emotional-awareness`: 聊天 AI 能识别用户负面情绪并切换至陪伴模式

### Modified Capabilities
- `career-chat-streaming`: AI 的 system prompt 行为规范从纯工具导向改为情感感知+工具双模

## Impact

- `frontend/src/app/api/chat/stream/route.ts` — SYSTEM_PROMPT 重写
