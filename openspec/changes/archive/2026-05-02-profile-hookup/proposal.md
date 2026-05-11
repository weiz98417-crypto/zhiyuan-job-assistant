## Why

需求探索页面的"保存到档案"把聊天归纳结果存入了 localStorage，但数据格式和 `UserProfile` 类型不匹配，用户看不到存了什么东西，也不知道在哪儿用。档案应该成为求职流程的"个人数据库"——聊出来的职业画像自动填充到设置页，并被 JD 评估、简历优化等模块消费。

## What Changes

- 统一 explore 归纳结果 → `UserProfile` 的数据映射，让 `targetRoles`、`superpowers`、`narrative`、`archetype` 正确合并到现有档案
- 在设置页新增"求职画像"卡片，展示从 explore 归纳来的数据（目标方向、技能、偏好、约束、叙事文案）
- 设置页的"职业定位"区块自动回填 explore 归档的数据
- 保存成功后给出明确提示"已保存到个人档案 → 前往设置查看"

## Capabilities

### New Capabilities
- `profile-data-mapping`: explore 归纳结果到 UserProfile 的双向数据映射，确保 localStorage 读写格式一致
- `profile-ui-visible`: 设置页展示归纳画像的 UI 卡片，让用户能看到从聊天里提取的结果

### Modified Capabilities
<!-- 无已有 spec 被修改 -->

## Impact

- `frontend/src/app/explore/page.tsx` — handleSave 数据映射逻辑
- `frontend/src/app/settings/page.tsx` — 展示归纳画像卡片 + 自动回填
- `frontend/src/types/index.ts` — 可能需要扩展 UserProfile（加 narrative / preferences / constraints 字段）
