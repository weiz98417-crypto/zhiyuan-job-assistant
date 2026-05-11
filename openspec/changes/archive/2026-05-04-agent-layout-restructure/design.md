## Layout Restructure

### Before
```
┌──────────┬──────────────────────┬────────────┐
│ Session  │      Chat            │  Profile   │
│ 280px    │      flex-1          │  420px     │
│ xl:flex  │                      │  xl:block  │
└──────────┴──────────────────────┴────────────┘
```

### After
```
┌──────────┬───────────────────────────────┐
│ Session  │        Chat Area              │
│ 260px    │        flex-1                 │
│ lg:flex  │                               │
└──────────┴───────────────────────────────┘
```

### Decisions

1. **移除 Profile 面板**：ProfilePanel 及其所有相关逻辑（handleSave, profile state, saving, saved, sidebarOpen 等）全部移除。入口改为 header 上一个链接图标指向 `/profile`。

2. **侧边栏断点 lg (1024px)**：`hidden xl:flex` → `hidden lg:flex`，宽度 280px → 260px。1024-1279px 区间的屏幕现在能看到侧边栏。

3. **移动端抽屉保持**：`lg:hidden` 屏幕上通过 hamburger 按钮打开抽屉。

4. **清理 dead code**：`handleSave`、`ProfilePanel` 组件引用、`profile`/`saving`/`saved`/`sidebarOpen` state、`loadProfile`、`saveProfile`、`createEmptyProfile` 等 profile 相关 import 一并移除。
