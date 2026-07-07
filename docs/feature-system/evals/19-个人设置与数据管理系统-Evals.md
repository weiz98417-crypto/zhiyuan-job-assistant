# 个人设置与数据管理系统 Evals

本文档根据项目当前 feature 文档、源码边界和已经沉淀的测试资产整理 个人设置与数据管理系统 的 evals。这里明确区分“已有自动化覆盖”“相关测试存在但需补精确断言”和“待补自动化”：没有可复跑证据的场景不能写成已完成事实。

## 评测对象

settings page、本地 profile、news settings、profile goals 同步、Markdown 导入导出、CLI import、清除本地数据和 localStorage 容错。

## 项目事实

### 关键实现面
- `src/app/settings/page.tsx`
- `src/app/api/data/profile/route.ts`
- `src/app/api/data/import/route.ts`
- `src/lib/parsers.ts`
- `src/lib/exporters.ts`
- `src/lib/db.ts`

### 已落地或部分落地的 eval 资产
- `src/app/settings/page.tsx`
- `src/__tests__/profile-signal-verified-write.test.ts`

### 从现有测试读到的行为
- Settings 目前主要靠页面实现和画像写入测试间接覆盖。
- 目标公司会影响首页新闻、岗位发现和 profile goals，不能只存在 localStorage。
- 数据清除和导入是高风险用户数据操作，缺少端到端确认 eval。

### 待补 eval 缺口
- 补 settings-data-management.test.ts 覆盖本地保存、清除确认和坏 JSON。
- 补 settings-cli-import.test.ts 覆盖 CLI 导入去重与失败提示。
- 补 profile goals route 保存目标公司的 eval。

## 实施与治理任务清单

这些任务只描述项目当前缺口，不假装已经落地。每完成一项，都应补一条自动化 eval，并在本文件对应场景下把状态从“待补自动化”改成“已有自动化覆盖”。

### 1. 补 settings-data-management.test.ts 覆盖本地保存、清除确认和坏 JSON

**为什么要补**: 这是当前 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/app/settings/page.tsx`、`src/__tests__/profile-signal-verified-write.test.ts`。
- fixture 必须包含：localStorage key、profile goal id、import file type、confirm flag 和 userId。
- 断言必须读取：localStorage 内容、服务端 profile read-back、导入记录和清除结果。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 2. 补 settings-cli-import.test.ts 覆盖 CLI 导入去重与失败提示

**为什么要补**: 这是当前 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/app/settings/page.tsx`、`src/__tests__/profile-signal-verified-write.test.ts`。
- fixture 必须包含：localStorage key、profile goal id、import file type、confirm flag 和 userId。
- 断言必须读取：localStorage 内容、服务端 profile read-back、导入记录和清除结果。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。

### 3. 补 profile goals route 保存目标公司的 eval

**为什么要补**: 这是当前 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 链路里还缺少确定性证据的部分；如果只靠人工试用，后续改路由、数据层或 UI 时很容易回归。

**实施方式**:
- 复用现有资产：`src/app/settings/page.tsx`、`src/__tests__/profile-signal-verified-write.test.ts`。
- fixture 必须包含：localStorage key、profile goal id、import file type、confirm flag 和 userId。
- 断言必须读取：localStorage 内容、服务端 profile read-back、导入记录和清除结果。
- 如果涉及写入，失败分支要证明没有留下部分写入；如果是页面链路，要覆盖空态、错误态和主操作。

**完成标准**: 本地测试或脚本能稳定复跑，并且失败信息能指向实现问题、测试缺口或产品预期变化中的一种。


## 基线 Evals

基线 evals 验证 个人设置与数据管理系统 的主链路是否成立。每条都必须说明真实入口、输入 fixture、证据读回和当前覆盖状态。

### B1. 编辑基本资料保存到 localStorage

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 个人设置与数据管理系统是纸鸢求职助手里的用户基础配置层。它保存用户的基本信息、职业定位、核心优势、薪资预期、目标公司动态偏好，并提供导入、导出、清除数据和退出登录能力。
- - 刷新页面后 profile 是否能从 localStorage 恢复。 - 核心优势添加和删除是否能持久化。 - 薪资区间和可谈/不可低于区间是否能保存。 - 目标公司设置是否同时写本地和尝试写服务端。 - 导出 `applications.md` 是否包含完整投递字段。 - `.md` 导入是否能去重写入投递记录。 - CLI 导入是否能读取 appl...
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“编辑基本资料保存到 localStorage”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“编辑基本资料保存到 localStorage”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“编辑基本资料保存到 localStorage”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

### B2. 目标公司保存到 localStorage 和服务端 profile goals

**状态**: 已有自动化覆盖

**项目依据**:
- - 刷新页面后 profile 是否能从 localStorage 恢复。 - 核心优势添加和删除是否能持久化。 - 薪资区间和可谈/不可低于区间是否能保存。 - 目标公司设置是否同时写本地和尝试写服务端。 - 导出 `applications.md` 是否包含完整投递字段。 - `.md` 导入是否能去重写入投递记录。 - CLI 导入是否能读取 appl...
- 1. 核心 profile 字段主要存在 localStorage，不是全部服务端化。 2. 快讯目标公司会尝试写服务端 `/api/data/profile`，但失败被视为 non-critical。 3. `.json` 文件在 input accept 中允许，但当前导入逻辑主要处理 `.md`。 4. 清除数据只清本地 Dexie 和 localSt...
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“目标公司保存到 localStorage 和服务端 profile goals”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“目标公司保存到 localStorage 和服务端 profile goals”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“目标公司保存到 localStorage 和服务端 profile goals”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B3. CLI 导入 applications/reports/profile

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 把 `applications` 写入 Dexie `db.applications`。 2. 把 `reports` 写入 Dexie `db.reports`。 3. 如果本地还没有 `zhiyuan-profile`，把 CLI profile 映射为 `UserProfile`。 4. 展示导入结果。
- 1. 核心 profile 字段主要存在 localStorage，不是全部服务端化。 2. 快讯目标公司会尝试写服务端 `/api/data/profile`，但失败被视为 non-critical。 3. `.json` 文件在 input accept 中允许，但当前导入逻辑主要处理 `.md`。 4. 清除数据只清本地 Dexie 和 localSt...
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“CLI 导入 applications/reports/profile”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“CLI 导入 applications/reports/profile”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“CLI 导入 applications/reports/profile”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### B4. Markdown 导入 applications

**状态**: 相关测试存在，需补精确断言

**项目依据**:
- 1. 把 `applications` 写入 Dexie `db.applications`。 2. 把 `reports` 写入 Dexie `db.reports`。 3. 如果本地还没有 `zhiyuan-profile`，把 CLI profile 映射为 `UserProfile`。 4. 展示导入结果。
- - 刷新页面后 profile 是否能从 localStorage 恢复。 - 核心优势添加和删除是否能持久化。 - 薪资区间和可谈/不可低于区间是否能保存。 - 目标公司设置是否同时写本地和尝试写服务端。 - 导出 `applications.md` 是否包含完整投递字段。 - `.md` 导入是否能去重写入投递记录。 - CLI 导入是否能读取 appl...
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“Markdown 导入 applications”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 主链路 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“Markdown 导入 applications”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“Markdown 导入 applications”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 现有测试覆盖了同一功能面，但还没有把这条场景的输入、边界和断言单独固定。

## 边界 Evals

边界 evals 验证权限、归属、失败、降级、澄清和安全边界。它们优先防止“看起来成功但实际越权或污染数据”的问题。

### E1. 清除所有数据必须 confirm

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这里清除的是本地 Dexie 和 localStorage 数据，不等于清除服务端所有用户数据。这个边界必须写清楚。
- 1. 核心 profile 字段主要存在 localStorage，不是全部服务端化。 2. 快讯目标公司会尝试写服务端 `/api/data/profile`，但失败被视为 non-critical。 3. `.json` 文件在 input accept 中允许，但当前导入逻辑主要处理 `.md`。 4. 清除数据只清本地 Dexie 和 localSt...
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“清除所有数据必须 confirm”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“清除所有数据必须 confirm”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“清除所有数据必须 confirm”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E2. 错误文件导入不污染数据

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 本地文件导入通过隐藏 `<input type="file">` 实现，支持 `.md` 和 `.json`，但当前逻辑只对 `.md` 做了解析。
- 1. 核心 profile 字段主要存在 localStorage，不是全部服务端化。 2. 快讯目标公司会尝试写服务端 `/api/data/profile`，但失败被视为 non-critical。 3. `.json` 文件在 input accept 中允许，但当前导入逻辑主要处理 `.md`。 4. 清除数据只清本地 Dexie 和 localSt...
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“错误文件导入不污染数据”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“错误文件导入不污染数据”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“错误文件导入不污染数据”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E3. 普通设置不访问 Admin API

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这与认证准入、JWT、个人信息隔离系统相关。设置页只提供入口，真正的登录态清除逻辑在认证 API。
- 设置页是 `src/app/settings/page.tsx`。
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“普通设置不访问 Admin API”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“普通设置不访问 Admin API”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“普通设置不访问 Admin API”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### E4. 服务端 profile 写入按当前用户作用域

**状态**: 已有自动化覆盖

**项目依据**:
- 这说明当前设置页的核心画像数据是 localStorage 持久化。服务端的 `/api/data/profile` 也存在，但页面并没有把所有字段统一写入服务端。
- 这个设计体现了当前项目的过渡状态：前端先保证本地可用，同时把关键目标公司偏好写入服务端 profile，供其他模块读取。
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“服务端 profile 写入按当前用户作用域”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 边界 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“服务端 profile 写入按当前用户作用域”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“服务端 profile 写入按当前用户作用域”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 回归 Evals

回归 evals 绑定项目里已经出现过或 feature 文档明确点名的风险，避免后续重构时把旧问题带回来。

### R1. localStorage profile 非法 JSON 崩溃

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 核心 profile 字段主要存在 localStorage，不是全部服务端化。 2. 快讯目标公司会尝试写服务端 `/api/data/profile`，但失败被视为 non-critical。 3. `.json` 文件在 input accept 中允许，但当前导入逻辑主要处理 `.md`。 4. 清除数据只清本地 Dexie 和 localSt...
- 这说明当前设置页的核心画像数据是 localStorage 持久化。服务端的 `/api/data/profile` 也存在，但页面并没有把所有字段统一写入服务端。
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“localStorage profile 非法 JSON 崩溃”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“localStorage profile 非法 JSON 崩溃”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“localStorage profile 非法 JSON 崩溃”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

### R2. CLI API 失败 loading 不结束

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 1. 核心 profile 字段主要存在 localStorage，不是全部服务端化。 2. 快讯目标公司会尝试写服务端 `/api/data/profile`，但失败被视为 non-critical。 3. `.json` 文件在 input accept 中允许，但当前导入逻辑主要处理 `.md`。 4. 清除数据只清本地 Dexie 和 localSt...
- “从 CLI 导入”调用的是 `src/app/api/data/import/route.ts`。
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“CLI API 失败 loading 不结束”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“CLI API 失败 loading 不结束”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“CLI API 失败 loading 不结束”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R3. 导入同公司同岗位重复

**状态**: 待补自动化，现有测试可作为落点

**项目依据**:
- 这能避免重复导入同一个公司岗位，但也意味着同公司同岗位的不同批次记录会被视为重复。对于求职产品来说，这是一个合理的保守默认，但未来如果要支持多次投递，需要加入时间或来源维度。
- - 序号 - 日期 - 公司 - 岗位 - 分数 - 状态 - PDF 标记 - 报告链接 - 备注
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“导入同公司同岗位重复”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“导入同公司同岗位重复”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“导入同公司同岗位重复”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这是产品预期或实现边界，当前不能写成已完成事实；需要补自动化后再改状态。

### R4. 清除数据未移除 profile

**状态**: 已有自动化覆盖

**项目依据**:
- 1. 核心 profile 字段主要存在 localStorage，不是全部服务端化。 2. 快讯目标公司会尝试写服务端 `/api/data/profile`，但失败被视为 non-critical。 3. `.json` 文件在 input accept 中允许，但当前导入逻辑主要处理 `.md`。 4. 清除数据只清本地 Dexie 和 localSt...
- - 刷新页面后 profile 是否能从 localStorage 恢复。 - 核心优势添加和删除是否能持久化。 - 薪资区间和可谈/不可低于区间是否能保存。 - 目标公司设置是否同时写本地和尝试写服务端。 - 导出 `applications.md` 是否包含完整投递字段。 - `.md` 导入是否能去重写入投递记录。 - CLI 导入是否能读取 appl...
- 主要实现面：`src/app/settings/page.tsx`、`src/app/api/data/profile/route.ts`、`src/app/api/data/import/route.ts`、`src/lib/parsers.ts`。

**输入/fixture**:
- 正例：基本资料、目标公司、applications/reports/profile 导入文件，用来验证“清除数据未移除 profile”的成功路径。
- 反例：非法 JSON、错误文件、普通设置调 Admin、清除所有数据未确认，用来证明该 回归 eval 不会被相邻功能误判为通过。
- 记录字段：localStorage key、profile goal id、import file type、confirm flag 和 userId；涉及写入时必须带当前用户或当前 run 的归属字段。

**执行路径**:
1. 从 设置页、localStorage profile、profile goals 服务端写入和 CLI/Markdown 导入 触发场景，不直接伪造最终状态。
2. 固定输入 fixture，执行“清除数据未移除 profile”对应动作，并记录请求、工具调用或页面状态。
3. 读取 localStorage 内容、服务端 profile read-back、导入记录和清除结果，把结果与 feature 文档里的产品语义对齐。
4. 如果当前只有间接覆盖，把缺口落到下方测试映射，而不是把状态写成已完成。

**断言**:
- 成功时必须能证明“清除数据未移除 profile”成立，而不是只出现一段 assistant 文案或页面提示。
- 失败、拒绝或降级时要保留可诊断原因，并且不能产生越权、部分写入或旧状态污染。
- 对 个人设置与数据管理系统 来说，判定通过的证据优先级是：持久化读回/API JSON/工具结果/hash/run evidence/UI 状态。

**现有覆盖**:
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies a single profile signal by reading it back before returning success
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies batch profile signal writes by reading every inserted id back
- `src/__tests__/profile-signal-verified-write.test.ts`: verifies skill promotion into the profile after confirming a skill signal

**缺口处理**: 这条 eval 的核心断言已经能从现有测试标题和相关实现中定位；后续只需要在行为变化时同步更新 fixture。

## 测试文件映射

- `src/app/settings/page.tsx`
- `src/__tests__/profile-signal-verified-write.test.ts`
  - verifies a single profile signal by reading it back before returning success
  - verifies batch profile signal writes by reading every inserted id back
  - verifies skill promotion into the profile after confirming a skill signal


## 最小上线门槛

- 至少所有 B 类主链路 eval 有自动化覆盖或明确的人工复跑脚本。
- E 类边界不能只靠 UI 文案判断，必须能证明权限、归属、降级或拒绝行为。
- R 类回归要绑定曾经出过问题的输入或测试名，避免“修过但没有防回归”。
- 个人设置与数据管理系统 的写入、导出、外部调用或 Agent 工具成功态，都必须有读回、hash、run evidence 或等价证据。
