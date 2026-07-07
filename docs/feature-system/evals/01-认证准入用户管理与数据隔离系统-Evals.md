# 认证准入用户管理与数据隔离系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 认证准入用户管理与数据隔离系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

注册、登录、管理员审批、角色变更、密码重置、token_version、auth cookie，以及按 user_id 隔离 applications、sessions、profiles、offers 等私有数据的访问边界。

## 项目事实

### 关键实现面
- `src/lib/auth.ts`
- `src/lib/auth-cookie.ts`
- `src/middleware.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/lib/data-repositories.ts`

### 已落地或部分落地的 eval 资产
- `src/__tests__/auth.test.ts`
- `src/__tests__/auth-cookie.test.ts`
- `src/__tests__/admin-users.test.ts`
- `src/__tests__/data-isolation.test.ts`
- `src/__tests__/check-isolation.test.ts`

### 从现有测试读到的行为
- auth.test.ts 已覆盖注册后 pending、重复用户名、错误密码、pending/rejected 禁止登录、bcrypt hash 和 token_version 增量。
- admin-users.test.ts 已覆盖 pending 用户审批/拒绝、角色升降级、重置密码、软删除及 token_version 更新。
- data-isolation.test.ts 和 check-isolation.test.ts 已把私有表访问约束落到 user_id、getCurrentUser 或 scopedDb 证据上。

### 待补 eval 缺口
- 补旧 token 在角色降级后访问 Admin API 的端到端 eval。
- 补 pending 用户携带旧 cookie 访问受保护页面的 middleware eval。
- 补唯一管理员被降级或软删除的产品风险 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补旧 token 在角色降级后访问 Admin API 的端到端 eval

**为什么要补**: 这是当前 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/auth.test.ts`、`src/__tests__/auth-cookie.test.ts`、`src/__tests__/admin-users.test.ts`、`src/__tests__/data-isolation.test.ts`、`src/__tests__/check-isolation.test.ts`。
- fixture 必须包含：userId、role、status、tokenVersion、cookie 属性、被访问的 record id。
- 断言必须读取：users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 pending 用户携带旧 cookie 访问受保护页面的 middleware eval

**为什么要补**: 这是当前 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/auth.test.ts`、`src/__tests__/auth-cookie.test.ts`、`src/__tests__/admin-users.test.ts`、`src/__tests__/data-isolation.test.ts`、`src/__tests__/check-isolation.test.ts`。
- fixture 必须包含：userId、role、status、tokenVersion、cookie 属性、被访问的 record id。
- 断言必须读取：users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补唯一管理员被降级或软删除的产品风险 eval

**为什么要补**: 这是当前 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/__tests__/auth.test.ts`、`src/__tests__/auth-cookie.test.ts`、`src/__tests__/admin-users.test.ts`、`src/__tests__/data-isolation.test.ts`、`src/__tests__/check-isolation.test.ts`。
- fixture 必须包含：userId、role、status、tokenVersion、cookie 属性、被访问的 record id。
- 断言必须读取：users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 认证准入用户管理与数据隔离系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 注册后默认 pending member

**状态**: 已有自动化覆盖

**项目依据**:
- 注册测试里验证了新用户默认是 `pending`、角色是 `member`。登录测试验证了 pending 和 rejected 用户会被阻止登录。
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“注册后默认 pending member”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“注册后默认 pending member”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“注册后默认 pending member”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user
- `src/__tests__/admin-users.test.ts`: promotes member to admin
- `src/__tests__/admin-users.test.ts`: demotes admin to member

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B2. active 用户凭正确密码登录并签发 cookie

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- - `src/__tests__/auth.test.ts`：注册、登录、密码校验、pending/rejected 阻断、token_version。 - `src/__tests__/auth-cookie.test.ts`：HTTP/HTTPS 下 cookie Secure 判断。 - `src/__tests__/admin-users.test....
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“active 用户凭正确密码登录并签发 cookie”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“active 用户凭正确密码登录并签发 cookie”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“active 用户凭正确密码登录并签发 cookie”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: rejects wrong password
- `src/__tests__/auth.test.ts`: blocks pending user from login
- `src/__tests__/auth.test.ts`: blocks rejected user from login
- `src/__tests__/auth.test.ts`: bcrypt generates different hashes for same password

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. 管理员把 pending 用户审批为 active

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手不是一个单用户本地 demo。它已经有登录、注册、管理员审批、用户状态、角色管理、JWT、cookie 安全、token_version 失效机制，以及按 `user_id` 隔离的业务数据。这个系统的产品目标不是“能登录”，而是保证每个用户只能看到自己的简历、JD、会话、Offer、画像和记忆资产。
- 因此，`用户认证与审批`、`Admin用户管理`、`登录安全与个人信息隔离` 不应该拆成三篇重复文档。它们是同一条安全链路的三个层面：谁能进入系统、管理员如何控制准入、进入后数据如何隔离。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“管理员把 pending 用户审批为 active”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“管理员把 pending 用户审批为 active”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“管理员把 pending 用户审批为 active”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: approves a pending user
- `src/__tests__/admin-users.test.ts`: rejects a pending user

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. 角色或密码变化递增 token_version

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 第四，角色或密码变更后，旧 JWT 如果继续有效，就会产生权限残留。`token_version` 是解决这个问题的关键。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“角色或密码变化递增 token_version”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“角色或密码变化递增 token_version”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“角色或密码变化递增 token_version”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: rejects wrong password
- `src/__tests__/auth.test.ts`: bcrypt generates different hashes for same password
- `src/__tests__/auth.test.ts`: token_version increments on role change
- `src/__tests__/admin-users.test.ts`: resets password and increments token_version

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. pending/rejected 用户不能登录

**状态**: 已有自动化覆盖

**项目依据**:
- 纸鸢求职助手不是一个单用户本地 demo。它已经有登录、注册、管理员审批、用户状态、角色管理、JWT、cookie 安全、token_version 失效机制，以及按 `user_id` 隔离的业务数据。这个系统的产品目标不是“能登录”，而是保证每个用户只能看到自己的简历、JD、会话、Offer、画像和记忆资产。
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“pending/rejected 用户不能登录”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“pending/rejected 用户不能登录”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“pending/rejected 用户不能登录”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: blocks pending user from login
- `src/__tests__/auth.test.ts`: blocks rejected user from login

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E2. member 不能访问 Admin API

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 第二，登录成功不等于有权限访问 Admin。所有 Admin API 都必须服务端校验 `role === 'admin'`，不能靠前端隐藏入口。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“member 不能访问 Admin API”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“member 不能访问 Admin API”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“member 不能访问 Admin API”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/admin-users.test.ts`: promotes member to admin
- `src/__tests__/admin-users.test.ts`: demotes admin to member

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E3. userA 不能读取 userB 私有数据

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 第三，多用户数据不能只靠前端过滤。简历、会话、投递、Offer、画像、故事库都必须在仓储层按 `user_id` 查询。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“userA 不能读取 userB 私有数据”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“userA 不能读取 userB 私有数据”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“userA 不能读取 userB 私有数据”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: rejects duplicate username
- `src/__tests__/auth.test.ts`: returns user for valid credentials
- `src/__tests__/auth.test.ts`: rejects non-existent user
- `src/__tests__/admin-users.test.ts`: approves a pending user

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### E4. HTTP LAN cookie 不强制 Secure，HTTPS cookie 必须 Secure

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- - LAN HTTP 请求不设置 Secure，避免本地或局域网部署时 cookie 无法保存。 - HTTPS 请求设置 Secure，提升线上安全性。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“HTTP LAN cookie 不强制 Secure，HTTPS cookie 必须 Secure”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“HTTP LAN cookie 不强制 Secure，HTTPS cookie 必须 Secure”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“HTTP LAN cookie 不强制 Secure，HTTPS cookie 必须 Secure”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth-cookie.test.ts`: does not mark cookies Secure for LAN HTTP requests
- `src/__tests__/auth-cookie.test.ts`: marks cookies Secure for HTTPS requests

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. 重复用户名注册必须失败

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 纸鸢求职助手不是一个单用户本地 demo。它已经有登录、注册、管理员审批、用户状态、角色管理、JWT、cookie 安全、token_version 失效机制，以及按 `user_id` 隔离的业务数据。这个系统的产品目标不是“能登录”，而是保证每个用户只能看到自己的简历、JD、会话、Offer、画像和记忆资产。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“重复用户名注册必须失败”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“重复用户名注册必须失败”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“重复用户名注册必须失败”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: rejects duplicate username

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. 错误密码不能签发 cookie

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- - `src/__tests__/auth.test.ts`：注册、登录、密码校验、pending/rejected 阻断、token_version。 - `src/__tests__/auth-cookie.test.ts`：HTTP/HTTPS 下 cookie Secure 判断。 - `src/__tests__/admin-users.test....
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“错误密码不能签发 cookie”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“错误密码不能签发 cookie”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“错误密码不能签发 cookie”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: rejects wrong password
- `src/__tests__/auth.test.ts`: bcrypt generates different hashes for same password
- `src/__tests__/admin-users.test.ts`: resets password and increments token_version

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R3. 旧 token 在 token_version 变化后失效

**状态**: 已有自动化覆盖

**项目依据**:
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 纸鸢求职助手不是一个单用户本地 demo。它已经有登录、注册、管理员审批、用户状态、角色管理、JWT、cookie 安全、token_version 失效机制，以及按 `user_id` 隔离的业务数据。这个系统的产品目标不是“能登录”，而是保证每个用户只能看到自己的简历、JD、会话、Offer、画像和记忆资产。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“旧 token 在 token_version 变化后失效”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“旧 token 在 token_version 变化后失效”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“旧 token 在 token_version 变化后失效”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: token_version increments on role change
- `src/__tests__/admin-users.test.ts`: resets password and increments token_version

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R4. 新增私有表查询不能绕过 check-isolation

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- `check-isolation.test.ts` 不是普通接口测试，它像一条安全扫描规则：私有表查询如果没有 `user_id`、`getCurrentUser` 或 `scopedDb` 这类上下文，就会被认为有风险。
- - 新用户注册后不能直接访问全部功能，需要审批。 - 管理员可以批准、拒绝、调整角色、重置密码、删除用户。 - 非管理员不能访问 Admin API。 - 用户数据必须按 `user_id` 查询和写入。 - 角色或密码变化后，旧 token 应失效。 - cookie 在 HTTPS 下应启用 Secure，但本地/LAN HTTP 不能因此无法登录。
- 主要实现面：`src/lib/auth.ts`、`src/lib/auth-cookie.ts`、`src/middleware.ts`、`src/app/api/auth/login/route.ts`。

**输入/fixture**:
- 正例：一个 active member、一个 admin、一个只属于当前用户的业务记录，用来验证“新增私有表查询不能绕过 check-isolation”的成功路径。
- 反例：pending/rejected 用户、member 调 Admin、userA 读取 userB 私有记录、旧 token，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：userId、role、status、tokenVersion、cookie 属性、被访问的 record id；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 注册、登录、Admin 用户 API、middleware 和 user_id scoped repositories 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“新增私有表查询不能绕过 check-isolation”对应动作，并记录请求、工具调用或页面状态。
3. 读取 users 表、auth_token cookie、token_version 校验和 data-repositories 的 user_id 过滤，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“新增私有表查询不能绕过 check-isolation”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 认证准入用户管理与数据隔离系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/auth.test.ts`: creates a new user with pending status
- `src/__tests__/auth.test.ts`: rejects duplicate username
- `src/__tests__/auth.test.ts`: returns user for valid credentials

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

## 测试文件映射

- `src/__tests__/auth.test.ts`
  - creates a new user with pending status
  - rejects duplicate username
  - returns user for valid credentials
  - rejects wrong password
  - rejects non-existent user
  - blocks pending user from login
  - blocks rejected user from login
  - bcrypt generates different hashes for same password
  - ...
- `src/__tests__/auth-cookie.test.ts`
  - does not mark cookies Secure for LAN HTTP requests
  - marks cookies Secure for HTTPS requests
  - supports an explicit deployment override
- `src/__tests__/admin-users.test.ts`
  - approves a pending user
  - rejects a pending user
  - promotes member to admin
  - demotes admin to member
  - resets password and increments token_version
  - soft-deletes user and cascading data
  - non-admin cannot be found by role filter
- `src/__tests__/data-isolation.test.ts`
  - user A cannot see user B applications
  - user A cannot see user B sessions
  - user A cannot see user B profile
  - user A cannot see user B offers
- `src/__tests__/check-isolation.test.ts`
  - passes when route has getCurrentUser
  - passes when route has scopedDb
  - flags route using private table without user_id or auth
  - ignores CREATE TABLE and ALTER TABLE statements
  - passes when route does not reference any private table


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 认证准入用户管理与数据隔离系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
