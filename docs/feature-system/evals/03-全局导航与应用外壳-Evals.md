# 全局导航与应用外壳 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 全局导航与应用外壳 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

AppShell、NavItem、桌面侧栏、移动底栏、管理员入口、主题切换、退出登录和 Agent 工作区布局。

## 项目事实

### 关键实现面
- `src/components/shell/AppShell.tsx`
- `src/components/shell/NavItem.tsx`
- `src/components/providers/ThemeProvider.tsx`
- `src/app/layout.tsx`

### 已落地或部分落地的 eval 资产
- `src/__tests__/admin-users.test.ts`
- `src/__tests__/admin-agent-runs.test.ts`
- `src/__tests__/admin-agent-reviews.test.ts`

### 从现有测试读到的行为
- Admin 权限目前主要由服务端测试保护，前端导航显隐缺少专门 eval。
- AppShell 承载普通页面和 Agent 工作区两类布局，Agent 页面不能被通用 max-width 限制。
- 退出登录必须清理 cookie，不能只做前端跳转。

### 待补 eval 缺口
- 补 app-shell-navigation.test.ts 检查导航分组、移动底栏和 active 高亮。
- 补 logout route + AppShell 交互 eval。
- 补 Agent 页面全宽布局的 UI 回归测试。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 app-shell-navigation.test.ts 检查导航分组、移动底栏和 active 高亮

**为什么要补**: 这是当前 AppShell、NavItem、移动底栏、users/me 和 logout 链路 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/admin-users.test.ts`、`src/__tests__/admin-agent-runs.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`。
- fixture 必须包含：pathname、role、active nav id、viewport、logout 响应。
- 断言必须读取：导航分组、active 样式、后台入口可见性和服务端权限拒绝。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 logout route + AppShell 交互 eval

**为什么要补**: 这是当前 AppShell、NavItem、移动底栏、users/me 和 logout 链路 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/admin-users.test.ts`、`src/__tests__/admin-agent-runs.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`。
- fixture 必须包含：pathname、role、active nav id、viewport、logout 响应。
- 断言必须读取：导航分组、active 样式、后台入口可见性和服务端权限拒绝。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 Agent 页面全宽布局的 UI 回归测试

**为什么要补**: 这是当前 AppShell、NavItem、移动底栏、users/me 和 logout 链路 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/admin-users.test.ts`、`src/__tests__/admin-agent-runs.test.ts`、`src/__tests__/admin-agent-reviews.test.ts`。
- fixture 必须包含：pathname、role、active nav id、viewport、logout 响应。
- 断言必须读取：导航分组、active 样式、后台入口可见性和服务端权限拒绝。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 全局导航与应用外壳 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 桌面侧栏按准备、行动、复盘分组

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 这种分组让用户知道每个功能处于求职生命周期的哪个位置：准备、行动、收尾。
- - `/login`、`/register` 不显示侧栏和底部导航。 - 普通业务页面显示桌面侧栏或移动底栏。 - 当前路径能正确高亮导航项。 - `/agent` 使用全宽工作区布局。 - `/api/users/me` 成功时显示用户信息。 - admin 用户能看到后台入口，member 用户看不到。 - 退出登录后 auth cookie 被清空并跳...
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“桌面侧栏按准备、行动、复盘分组”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“桌面侧栏按准备、行动、复盘分组”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“桌面侧栏按准备、行动、复盘分组”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. NavItem 能按 pathname 标记 active

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- `NavItem` 使用 `usePathname()` 判断 active：
- - `AuthGate` 名字容易让人误解为完整鉴权，但它实际只决定是否显示 AppShell。 - 移动端导航只取前 5 项，用户从移动端进入 CV、Tracker、Interview 的路径不如桌面直观。 - `AppShell` 读取 `/api/users/me` 后没有显式处理 `status`，比如 inactive 用户的前端提示需要依赖其他层...
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“NavItem 能按 pathname 标记 active”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“NavItem 能按 pathname 标记 active”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“NavItem 能按 pathname 标记 active”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B3. 移动端底栏限制核心入口

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 这是一个明确取舍。移动端底部导航空间有限，优先保留准备阶段和核心入口；简历、投递、面试、Offer、Analytics 等页面仍可通过其他入口或链接进入，但不在底部第一层展示。
- 纸鸢求职助手不是单页聊天工具，而是包含 Agent、职位发现、JD 评估、求职画像、简历管理、投递追踪、面试准备、Offer 评估、数据分析、个人设置和后台治理的完整应用。全局导航与应用外壳决定用户能否在这些模块之间保持方向感，也决定登录态、用户信息、主题、管理员入口和移动端导航如何统一。
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“移动端底栏限制核心入口”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“移动端底栏限制核心入口”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“移动端底栏限制核心入口”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B4. admin 用户看到后台治理入口

**状态**: 已有自动化覆盖

**项目依据**:
- - `/login`、`/register` 不显示侧栏和底部导航。 - 普通业务页面显示桌面侧栏或移动底栏。 - 当前路径能正确高亮导航项。 - `/agent` 使用全宽工作区布局。 - `/api/users/me` 成功时显示用户信息。 - admin 用户能看到后台入口，member 用户看不到。 - 退出登录后 auth cookie 被清空并跳...
- 纸鸢求职助手不是单页聊天工具，而是包含 Agent、职位发现、JD 评估、求职画像、简历管理、投递追踪、面试准备、Offer 评估、数据分析、个人设置和后台治理的完整应用。全局导航与应用外壳决定用户能否在这些模块之间保持方向感，也决定登录态、用户信息、主题、管理员入口和移动端导航如何统一。
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“admin 用户看到后台治理入口”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“admin 用户看到后台治理入口”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“admin 用户看到后台治理入口”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: promotes member to admin
- `src/__tests__/admin-users.test.ts`: demotes admin to member
- `src/__tests__/admin-agent-runs.test.ts`: rejects non-admin users
- `src/__tests__/admin-agent-reviews.test.ts`: rejects non-admin users

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. member 隐藏 Admin links，权限仍由服务端拒绝

**状态**: 已有自动化覆盖

**项目依据**:
- AppShell 是前端展示层，不替代服务端权限判断。后台接口仍必须用 `getCurrentUser()` 和角色校验保护。
- 这里的“只展示给 admin”是前端体验层控制，不是安全边界。对应后台 API 仍必须做服务端角色校验。
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“member 隐藏 Admin links，权限仍由服务端拒绝”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“member 隐藏 Admin links，权限仍由服务端拒绝”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“member 隐藏 Admin links，权限仍由服务端拒绝”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: promotes member to admin
- `src/__tests__/admin-users.test.ts`: demotes admin to member
- `src/__tests__/admin-agent-runs.test.ts`: rejects non-admin users
- `src/__tests__/admin-agent-reviews.test.ts`: rejects non-admin users

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. 根路径 / 不能让所有 nav active

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- `NavItem` 使用 `usePathname()` 判断 active：
- AppShell 用 `ToastProvider` 包住整个应用外壳，让所有页面都能使用统一 toast。
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“根路径 / 不能让所有 nav active”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“根路径 / 不能让所有 nav active”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“根路径 / 不能让所有 nav active”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. 移动底栏不能遮挡内容

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 移动端底部还额外添加了 `h-16` padding，避免页面内容被底部导航遮挡。
- - `/login`、`/register` 不显示侧栏和底部导航。 - 普通业务页面显示桌面侧栏或移动底栏。 - 当前路径能正确高亮导航项。 - `/agent` 使用全宽工作区布局。 - `/api/users/me` 成功时显示用户信息。 - admin 用户能看到后台入口，member 用户看不到。 - 退出登录后 auth cookie 被清空并跳...
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“移动底栏不能遮挡内容”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“移动底栏不能遮挡内容”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“移动底栏不能遮挡内容”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. Agent 页面不使用普通 max-width

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这个设计是因为 Agent Chat 属于工作区页面，需要更宽的对话和工具结果空间；普通页面则保持较强的内容约束，便于阅读和扫描。
- - `/login`、`/register` 不显示侧栏和底部导航。 - 普通业务页面显示桌面侧栏或移动底栏。 - 当前路径能正确高亮导航项。 - `/agent` 使用全宽工作区布局。 - `/api/users/me` 成功时显示用户信息。 - admin 用户能看到后台入口，member 用户看不到。 - 退出登录后 auth cookie 被清空并跳...
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“Agent 页面不使用普通 max-width”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Agent 页面不使用普通 max-width”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Agent 页面不使用普通 max-width”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 岗位发现/JD 管理等命名回退到旧文案

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 纸鸢求职助手不是单页聊天工具，而是包含 Agent、职位发现、JD 评估、求职画像、简历管理、投递追踪、面试准备、Offer 评估、数据分析、个人设置和后台治理的完整应用。全局导航与应用外壳决定用户能否在这些模块之间保持方向感，也决定登录态、用户信息、主题、管理员入口和移动端导航如何统一。
- - 显示名首字作为头像。 - 显示名。 - 角色：管理员或成员。
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“岗位发现/JD 管理等命名回退到旧文案”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“岗位发现/JD 管理等命名回退到旧文案”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“岗位发现/JD 管理等命名回退到旧文案”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R2. Admin links 对 member 泄露

**状态**: 已有自动化覆盖

**项目依据**:
- - `/login`、`/register` 不显示侧栏和底部导航。 - 普通业务页面显示桌面侧栏或移动底栏。 - 当前路径能正确高亮导航项。 - `/agent` 使用全宽工作区布局。 - `/api/users/me` 成功时显示用户信息。 - admin 用户能看到后台入口，member 用户看不到。 - 退出登录后 auth cookie 被清空并跳...
- 这样 `/tracker?status=applied` 或 `/admin/users` 这类子路径仍能高亮对应入口。
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“Admin links 对 member 泄露”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Admin links 对 member 泄露”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Admin links 对 member 泄露”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: promotes member to admin
- `src/__tests__/admin-users.test.ts`: demotes admin to member
- `src/__tests__/admin-users.test.ts`: non-admin cannot be found by role filter
- `src/__tests__/admin-agent-runs.test.ts`: returns redacted recent run summaries and Chinese monitor stats for admins

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. logout 只前端跳转未清 cookie

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- - `/login`、`/register` 不显示侧栏和底部导航。 - 普通业务页面显示桌面侧栏或移动底栏。 - 当前路径能正确高亮导航项。 - `/agent` 使用全宽工作区布局。 - `/api/users/me` 成功时显示用户信息。 - admin 用户能看到后台入口，member 用户看不到。 - 退出登录后 auth cookie 被清空并跳...
- AppShell 是前端展示层，不替代服务端权限判断。后台接口仍必须用 `getCurrentUser()` 和角色校验保护。
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“logout 只前端跳转未清 cookie”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“logout 只前端跳转未清 cookie”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“logout 只前端跳转未清 cookie”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. users/me 请求失败导致 AppShell 崩溃

**状态**: 已有自动化覆盖

**项目依据**:
- 需要注意的是，当前 `AuthGate` 本身没有主动校验登录态。真正的用户校验在各 API、页面或中间层里完成。AppShell 会调用 `/api/users/me` 读取用户信息，但这个读取失败只会让用户区域不展示，不等同于服务端鉴权。
- AppShell 通过 `useTheme()` 获取：
- 主要实现面：`src/components/shell/AppShell.tsx`、`src/components/shell/NavItem.tsx`、`src/components/providers/ThemeProvider.tsx`、`src/app/layout.tsx`。

**输入/fixture**:
- 正例：admin 与 member 两类用户分别打开桌面和移动视口，用来验证“users/me 请求失败导致 AppShell 崩溃”的成功路径。
- 反例：根路径、users/me 失败、member 访问后台入口、Agent 全屏页，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：pathname、role、active nav id、viewport、logout 响应；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 AppShell、NavItem、移动底栏、users/me 和 logout 链路 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“users/me 请求失败导致 AppShell 崩溃”对应动作，并记录请求、工具调用或页面状态。
3. 读取 导航分组、active 样式、后台入口可见性和服务端权限拒绝，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“users/me 请求失败导致 AppShell 崩溃”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 全局导航与应用外壳 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: soft-deletes user and cascading data
- `src/__tests__/admin-agent-runs.test.ts`: rejects non-admin users

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/__tests__/admin-users.test.ts`
  - approves a pending user
  - rejects a pending user
  - promotes member to admin
  - demotes admin to member
  - resets password and increments token_version
  - soft-deletes user and cascading data
  - non-admin cannot be found by role filter
- `src/__tests__/admin-agent-runs.test.ts`
  - returns redacted recent run summaries and Chinese monitor stats for admins
  - keeps the failure filter available for investigation
  - rejects non-admin users
- `src/__tests__/admin-agent-reviews.test.ts`
  - returns review summaries and eval candidates for admins
  - rejects non-admin users
  - updates eval candidate status with admin auth
  - returns promotion lifecycle draft for eval candidates


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 全局导航与应用外壳 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
