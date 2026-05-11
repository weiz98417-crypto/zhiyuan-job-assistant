## Context

需求探索页"帮我总结"调用 `/api/chat/summarize` 拿到 `ProfileData`，用户点"保存到档案"后写入 `localStorage` 的 `lingji-ai-profile` 键。同时设置页也读写同一键，但使用 `UserProfile` 类型。两边结构不同，explore 写的数据设置页读不到，用户不知道档案存到哪里了。

当前数据流：

```
explore page                  settings page
  │                              │
  │  summarize → ProfileData     │  read UserProfile
  │  save → merge + write ───── localStorage ── read
  │                              │
  └─ targetRoles[{title,...}] ── 冲突 ── targetRoles[{name, level, fit}]
```

## Goals / Non-Goals

**Goals:**
- 统一 explore 和 settings 之间 `localStorage` 的数据格式，完整双向读取
- 设置页新增"求职画像"卡片，展示归纳结果里的 archetype / narrative / preferences / constraints
- 设置页"职业定位"区块自动回填 explore 归档数据（方向 → targetRoles，优势 → superpowers，叙事 → headline）
- 保存后给出可点击的提示"查看档案 →"

**Non-Goals:**
- 不改造 JD 评估 / 简历优化等其他模块（只打通档案可读可用，不在此 change 做深度整合）
- 不做后端持久化（保持 localStorage）

## Decisions

### 1. 扩展 UserProfile 而非新建键

**选择**：在 `UserProfile` 加字段 `narrative?`、`preferences?`、`constraints?`、`archetype?`，复用同一个 `lingji-ai-profile` 键。

**理由**：多键会导致 sync 问题。一个键一份数据，读取时合并默认值即可。

### 2. targetRoles 映射：title → name, confidence 映射为 fit

```
explore { title, confidence, reasoning }
         ↓
profile { name: title, level: "", fit: confidence>=80?"primary":"secondary" }
```

**理由**：explore 的 `title` 语义上等于 profile 的 `name`。`level` 无法从聊天推导，留空让用户手动填。`confidence` 转为 `fit` 级别。

### 3. 保存提示用 toast + 链接，不走页面跳转

保存成功后在按钮旁边显示 `✓ 已保存到档案 → 查看`（可点击跳 `/settings`）。不自动跳转，避免打断聊天。

## Risks / Trade-offs

- `UserProfile` 字段膨胀 → 用可选字段（`?`），保持向后兼容，旧数据不受影响
- confidence→fit 映射粗糙 → 用户可以手动改，自动填充只是起点
