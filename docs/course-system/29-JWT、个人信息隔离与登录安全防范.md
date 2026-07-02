# 29 JWT、个人信息隔离与登录安全防范

产品进入交付前，Zhiyuan 必须把“谁在使用系统”“他能访问哪些求职资产”“登录态是否可信”这三件事做成一套完整安全底座。因为这个产品处理的不是普通内容，而是简历、JD、Offer、薪资、面试回答、自我定位、长期记忆和 Agent 工具运行证据。

本篇是 29-34 的总览：JWT 负责身份，个人信息隔离负责资产归属，登录安全负责会话生命周期。三者一起决定 Zhiyuan 是否能作为多用户 AI 求职助手交付。

## 安全底座的产品目标

| 目标 | 产品含义 |
|---|---|
| 身份可信 | 系统知道当前用户是谁、是什么角色、账号状态是否可用 |
| 权限清楚 | 未登录、pending、member、admin 在页面和 API 上边界一致 |
| 资产隔离 | 每个用户只能读取和改动自己的简历、JD、Offer、面试、画像、记忆 |
| Agent 不越权 | Agent Chat 和 48 个注册工具不能高于当前用户权限 |
| 成功有证据 | 登录、审批、写入、导出、退出都能被读回或验证 |
| 隐私默认私有 | 高敏求职材料不因 Admin、run、review 或记忆机制被默认扩散 |

## 身份链路

```text
注册 / 登录
  -> 用户状态与角色
  -> JWT
  -> HTTP-only cookie
  -> 页面守卫和 API 守卫
  -> 当前用户读回
  -> repository 按 userId 读写
  -> PostgreSQL + pgvector
  -> read-back / verifier
```

JWT 只表达身份，不表达业务对象归属。业务对象归属必须由服务端根据当前用户身份推导，不能相信请求体里的 `userId`、`ownerId` 或 `createdBy`。

## 用户角色边界

| 用户状态 | 允许 | 禁止 |
|---|---|---|
| 未登录 | 注册、登录、公开说明页 | 核心求职页面和数据 API |
| pending/member | 查看待审批状态 | Agent、CV、Reports、Offer、Interview、Profile、Admin |
| active/member | 使用自己的求职资产和 Agent Chat | Admin 管理、读取他人资产、替他人写入 |
| active/admin | 用户审批、记忆治理、运行证据复查 | 绕过 owner 边界直接操作用户私有资产 |
| rejected/member | 被明确阻断 | 通过旧登录态恢复访问 |

Admin 是治理角色，不是“超级求职用户”。它能管理用户状态、审核团队知识候选、查看必要的运行摘要，但不应默认暴露用户完整简历、薪资、Offer 和面试原文。

## 受保护资产

| 资产 | 风险 | 保护方式 |
|---|---|---|
| 简历 | 被他人读取、被未确认改写 | userId 隔离，proposal -> confirm -> apply -> read-back |
| JD 和报告 | 报告串用户，后续简历建议用错上下文 | report/JD 同 userId 读写 |
| Offer | 薪资和谈判策略泄露 | 默认私有，offerId 和 userId 组合校验 |
| 面试记录 | 暴露弱点和真实经历 | session 按当前用户恢复 |
| 职业画像 | 错误画像、跨用户污染 | 来源、置信度、可见性和撤回路径 |
| 记忆 | 私密信息被团队化 | private/team_pending/team 分级治理 |
| Agent run | 工具输入输出泄露原文 | summary-first、脱敏、最小展示 |

## 当前运行事实

| 项 | 口径 |
|---|---|
| 当前 runtime | PostgreSQL + pgvector |
| SQLite | fallback/archive/migration |
| 业务 agent | `general`、`evaluate`、`resume`、`interview`、`profile`、`offer` |
| Orchestrator | 内部编排，不作为第 7 个业务 agent |
| 工具 | 48 个注册工具，受 taskType、agentAllowlist、effect、read-back 约束 |
| 写入成功 | 必须有 read-back 或 verifier |

## 安全交付顺序

```text
登录体系
  -> 权限矩阵
  -> 个人资产隔离
  -> Agent 工具权限
  -> 登录安全防范
  -> 集中开发与测试
  -> 全量测试
```

29 给出总览，30-34 分别展开：

| 文档 | 重点 |
|---|---|
| 30 登录体系与权限构建 | 注册、登录、审批、角色和页面/API 边界 |
| 31 个人信息隔离体系构建 | 简历、JD、Offer、面试、画像、记忆的 owner 规则 |
| 32 登录安全体系构建 | token 过期、退出、状态变更、旧会话失效和失败态 |
| 33 集中开发与测试 | 把安全边界落成可验收能力 |
| 34 全量测试 | 用多账号、多材料、全链路证明可交付 |

## 完成口径

本阶段完成后，Zhiyuan 的安全底座达到以下状态：

1. 用户能注册、登录、退出，并读回当前身份。
2. pending/member/admin 的页面和 API 权限一致。
3. 用户求职资产按 userId 隔离。
4. Agent 和工具无法绕过登录态、角色和 owner 边界。
5. 高价值写入必须确认并读回。
6. Admin 只做治理，不默认暴露用户私密原文。
7. PostgreSQL + pgvector 是交付验收的事实源。

这个底座让后续安全体系可以继续覆盖用户注入、隐私、图片文字审核和最终交付。

## 安全链路场景展开

| 场景 | 如果没有安全底座 | Zhiyuan 的交付做法 |
|---|---|---|
| 用户查看简历 | 可能通过 URL 或接口读到别人简历 | JWT 确认身份，服务端派生 userId，CV 按 owner 读回 |
| 用户要求 Agent 改简历 | Agent 可能直接写入或写错用户 | proposal -> confirm -> apply -> section read-back |
| Admin 审批用户 | 页面显示成功但状态没有变化 | 审批后读回 users 状态和 tokenVersion |
| 用户上传 Offer | 薪资字段可能进入公共记忆 | Offer 默认 private，团队化必须走审核 |
| Agent run 复查 | 后台可能暴露完整简历或薪资 | Admin 只看必要摘要、tool、phase、verifier |

这张表把 JWT、隔离和登录安全串成一个产品故事：身份不是为了登录页面，而是为了保护每一份求职资产。

## 安全边界与业务链路的对应关系

| 业务链路 | 需要的安全边界 | 交付证据 |
|---|---|---|
| Agent Chat 输入 JD | 当前用户已登录，输入只作为业务材料 | session 归属当前 userId |
| Reports 查看报告 | 报告按 owner 读取 | reportId + userId read-back |
| CV 应用提案 | 用户确认，目标 section 属于当前用户 | proposal status + section hash |
| Offer 分析 | Offer 默认 private | offerReportId 当前用户可读 |
| Interview 继续 | session 属于当前用户 | currentQuestion 恢复 |
| Profile 写信号 | 来源明确，可见性明确 | profile signal 可撤回 |
| Admin 审批 | role=admin，tokenVersion 最新 | users 状态读回 |

这样讲安全，学生能看到每个技术边界都对应一个产品风险，而不是孤立背 JWT、cookie、owner 这些概念。

## 安全总览的讲述顺序

```text
先讲用户资产：简历、Offer、面试、画像都很敏感。
再讲身份：系统必须知道当前是谁。
再讲权限：不同账号能做的事不同。
再讲隔离：同样的 reportId 也不能跨用户读取。
再讲 Agent：Agent 不能比用户本人权限更高。
最后讲证据：保存和审批都要能读回。
```

按这个顺序讲，安全体系会自然服务产品，而不是变成独立技术章节。
