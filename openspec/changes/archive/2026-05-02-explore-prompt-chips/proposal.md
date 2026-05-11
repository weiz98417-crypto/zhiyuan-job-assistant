## Why

探索页面空状态下的提示芯片（prompt chips）太少、太小，用户不知道可以聊什么方向。增加数量和尺寸让对话入口更友好。

## What Changes

- 提示芯片从 3 个扩展到 8 个，覆盖经验、技能、偏好、转行、加班等常见求职话题
- 芯片字体 `text-xs` → `text-base`，内边距 `px-3 py-1.5` → `px-4 py-2.5`
- 芯片间距 `gap-2` → `gap-3`，icon 间距 `mr-1` → `mr-1.5`

## Capabilities

### Modified Capabilities
- `explore-chat-ui`: 空状态提示芯片数量、尺寸、间距调整

## Impact

- `src/app/explore/page.tsx` — PROMPT_CHIPS 数组 + 渲染样式
