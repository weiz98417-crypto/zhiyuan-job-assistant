## 1. 移除 Profile 面板

- [x] 1.1 删除 `ProfilePanel` 组件定义和 `ProfileData` 接口（整个函数 + 类型）
- [x] 1.2 移除 `profile`、`saving`、`saved`、`sidebarOpen` 状态及相关 state
- [x] 1.3 移除 `handleSave` callback 及相关 import（loadProfile, saveProfile, createEmptyProfile, updateRolePreference 等）
- [x] 1.4 移除 JSX 中的桌面端 Profile 面板（`hidden xl:block w-[420px]...`）和移动端 Profile 抽屉
- [x] 1.5 移除移动端 Profile toggle 按钮

## 2. 侧边栏断点调整

- [x] 2.1 桌面侧边栏：`hidden xl:flex w-[280px]` → `hidden lg:flex w-[260px]`
- [x] 2.2 移动端抽屉和按钮：`xl:hidden` → `lg:hidden`

## 3. Header 简化 + Profile 入口

- [x] 3.1 在 header 右侧添加指向 `/profile` 的 User 图标链接
- [x] 3.2 清理不再使用的 import（Sparkles, Target, Wrench, Heart, AlertTriangle, FileText, Check 等）

## 4. 验证

- [x] 4.1 `npx tsc --noEmit` — 0 errors
- [x] 4.2 `npm run build` — 通过
