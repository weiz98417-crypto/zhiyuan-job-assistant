# Pre-Apply Eval: PostgreSQL + pgvector 迁移计划

日期：2026-06-03

目的：在执行任何 PostgreSQL / pgvector OpenSpec task 之前，记录当前基线、边界和回归评估结果，避免后续迁移时不知道问题是新引入还是原本存在。

## 结论

- 基线功能测试通过：完整 Vitest 通过，生产 build 通过。
- 高风险边界测试通过：数据隔离、管理员审批、画像质量、图片路由、缩略图保护、offer 流程、JD 摘要等 48 个测试通过。
- lint 当前基线失败：主要是既有 `any`、临时目录 `tmp-open-source`、React hooks/purity warnings 等，不是本次 OpenSpec 文档引入。
- agent mock eval 当前指标低，但 eval harness 本身不可信：多个期望工具调用的 case 被 mock 成“无工具”，导致工具选择准确率被低估。
- live eval 未执行：本机 3000 正在监听，但 `/api/cv/references` 返回 401，当前 eval 脚本没有认证上下文。

## 1. 基线 Eval

### 命令

```powershell
node scripts/eval-agent.mjs --mock
```

### 结果

- Total: 23
- Passed: 20
- Failed: 3
- Hallucinations: 1
- Retries: 0

主要指标：

- Tool selection accuracy: 69.6% / target >= 85%
- Param accuracy: 78.6% / target >= 90%
- First-call success: 47.8% / target >= 70%
- Hallucination rate: 4.3% / target < 5%
- Task completion rate: 87.0% / target >= 80%
- Stop accuracy: 100.0% / target >= 90%

### 判断

这个结果不能直接作为真实 agent 能力基线。原因是 `scripts/eval-agent.mjs --mock` 的 mock 逻辑不完整：

- Case 1/2/3/4/5/20 期望工具调用，但 mock 输出是“无工具”。
- Case 21/22/23 期望 permanent error，但 mock 输出 ok。
- 脚本注释写 20 cases，实际现在跑 23 cases。

后续要把 agent eval 作为质量门，必须先修 eval harness 或新增一个更可靠的 deterministic routing eval。

## 2. 边界 Eval

### 命令

```powershell
npx.cmd vitest run src/__tests__/data-isolation.test.ts src/__tests__/admin-users.test.ts src/__tests__/profile-skill-quality.test.ts src/__tests__/jd-image-routing.test.ts src/__tests__/image-thumbnail-guard.test.ts src/__tests__/agent-policy.test.ts src/__tests__/offer-flow.test.ts src/__tests__/jd-evaluation-summary.test.ts
```

### 结果

- Test files: 8 passed / 8
- Tests: 48 passed / 48

### 覆盖范围

- 多用户数据隔离。
- 管理员用户审批。
- 画像技能质量过滤。
- JD/Offer/Resume 图片路由。
- 缩略图误识别保护。
- Evaluate agent 工具策略。
- Offer 截图与 offer evaluation。
- JD 评估摘要格式。

### 判断

边界测试当前是绿色，可以作为 PostgreSQL 迁移前的高风险行为基线。

## 3. 回归 Eval

### 完整单测

命令：

```powershell
npm.cmd test
```

结果：

- Test files: 12 passed / 12
- Tests: 79 passed / 79

### 生产构建

命令：

```powershell
npm.cmd run build
```

结果：

- Next.js production build passed。
- 103 个静态页面生成成功。
- 有 1 个既有 Turbopack tracing warning：`src/app/api/agent/read-file/route.ts` 的动态文件读取导致 tracing 范围过大。

### Lint

命令：

```powershell
npm.cmd run lint
```

结果：

- Failed。
- 375 problems: 86 errors, 289 warnings。

主要类别：

- `src/__tests__/*` 中多个 `no-explicit-any`。
- `tmp-open-source/*` 被 ESLint 扫描，包含大量外部/临时代码错误。
- React hooks / purity warnings。
- 多处 unused vars / require imports。

### 判断

回归功能测试和 build 可作为绿色基线。lint 不能作为当前 apply 阻断门，除非先单独开 lint cleanup / eslint ignore change。

## 4. Live Eval 状态

检查：

```powershell
Invoke-WebRequest http://localhost:3000/api/cv/references
```

结果：

- 本机 `0.0.0.0:3000` 正在监听。
- `/api/cv/references` 返回 401 Unauthorized。

判断：

- live eval 当前不能直接跑，因为 `scripts/eval-agent.mjs --live` 以 `/api/cv/references` 作为 server health check，且没有登录 cookie / eval 用户。
- 后续需要新增认证支持，例如 `EVAL_COOKIE`、专用测试用户登录步骤，或一个受控的 eval health endpoint。

## 5. Apply 前质量门建议

在真正执行 `add-postgres-pgvector-foundation` 前，建议确认：

- 完整 Vitest 仍然 79/79 通过。
- 高风险边界测试仍然 48/48 通过。
- build 仍然通过。
- lint 暂不阻断，但记录为当前红基线。
- agent mock eval 暂不阻断，但必须在 agent 长期记忆接入前修成可信 eval。
- live eval 暂不阻断，但必须在 agent 相关 change apply 前补认证上下文。

## 6. 后续需要补的 Eval Work

- 新增 `eval:baseline`：稳定输出当前单测、build、OpenSpec validate 结果。
- 新增 `eval:boundary`：固定运行数据隔离、画像质量、图片路由、offer/JD 摘要等高风险测试。
- 新增 `eval:regression`：完整 Vitest + build。
- 修复或替换 `scripts/eval-agent.mjs --mock`，使 mock 输出和 expectedTools 一致。
- 为 live eval 增加认证机制，避免 401 假失败。
