# Spec 36: Dependency Diet(依赖瘦身,B7)

Target label: `ready-for-agent`
Depends on: 无硬依赖;建议在 spec 37(删 puppeteer)之前做,避免重复动 package.json;批次 0.21.0

## Problem

依赖树有明确冗余(grilling 前探查实证):

- **antd ^6.6.1**(package.json:89)+ **@ant-design/icons ^6.3.2**(:74,零导入):antd 仅 `src/components/agent/AgentActivityTrack.tsx:4` 一处导入(Progress/Timeline/ConfigProvider,dark algorithm 切换 :79),只被 `AgentChat.tsx` 引用——与自建 design kit 并存,重。
- **pdf2json ^4.0.3**(:105):全仓零导入,纯声明未使用;`pdf-parse`(:104)独占简历文本提取链(document-extraction),必须保留。
- **@types/better-sqlite3** 在 dependencies(:88),应移 devDependencies(@types/pg 已在 devDependencies :125,无需动)。
- 待审:`thinking-orbs`(:117)、`dommatrix`(:94)、`@napi-rs/canvas`(:81,注意是**直接依赖**而非传递——先查直接引用再定去留,pdfjs-dist 渲染可能需要它);`lucide-react` 声明 ^1.14.0(:99)本地实装 1.16.0。
- `puppeteer ^24.43.0`(:108)与 playwright(:107)并存——**归 spec 37 处理,本 spec 不动**。

## Solution

1. `AgentActivityTrack.tsx` 的 Progress/Timeline 迁到自建 kit(lucide 图标 + 现有 token),ConfigProvider/主题切换随 design kit 既有暗色机制走;迁完**卸载 antd 与 @ant-design/icons**。
2. 卸载 pdf2json。
3. @types/better-sqlite3 移到 devDependencies。
4. 待审项逐个查直接引用:无直接引用且非必要传递依赖的(dommatrix 若仅 puppeteer 传递依赖,随 37 一起消失)记录进 PR,能卸则卸;@napi-rs/canvas 有直接依赖身份,查到真实用途前**不卸**。

## User Stories

- 无用户可见变化(Progress/Timeline 迁移视觉等价);安装更快、供应链面更小。

## Implementation Decisions

- 迁移以视觉等价为准;Progress/Timeline 在自建 kit 里的落点(`src/components/ui/`)与命名走领域词,不为迁移发明通用抽象。
- 卸载前后各跑一次完整 `npm ci` + 全测试,lockfile diff 逐块人工过目。

## Testing Decisions

- AgentActivityTrack 渲染测试(进度/时间线/暗色)迁移后全绿。
- 全量 1490+ 测试绿;tsc 0 新错;CI 绿(依赖变化必须过一轮 CI 再合)。

## Out of Scope

- puppeteer/Playwright 收敛(spec 37);promptfoo 的 npx 锁版方式(不动);任何依赖升级(除非卸载所需)。

## Further Notes

- 预估半天~一天;若 antd 迁移发现 AgentActivityTrack 与 antd 耦合超预期(如主题算法深度使用),允许降级为「仅卸 @ant-design/icons + pdf2json + types 归位」,antd 迁移移入 0.22 后——但需在 PR 说明原因。
