# Spec 34: Workbench Primitives And Overlay Migration(工作台原语与浮层全迁,B4)

Target label: `ready-for-agent`
Depends on: 2026-09 UI 评审 C3/C4 既有交付(浮层 kit `src/components/ui/overlay.tsx` 188 行、workbench kit `workbench.tsx` 126 行,当前仅 evaluate/reports 与 tracker 两页采用);批次 0.21.0

## Problem

工作台五页存在成片复制粘贴(2026-09 评审 C3/C4 的遗留尾巴,探查实证):

- **页头块** `page-heading` **13 处/12 个文件**逐字复制:tracker:422、discover:383、analytics:232、interview:260、profile:253+316、evaluate:69、evaluate/jds:167、evaluate/reports:246、evaluate/history:86、memory、settings、changelog。
- **搜索输入** 6 处同型:tracker:450、evaluate/jds:189、evaluate/reports:261、evaluate/history:94、`AgentInterviewHistory.tsx:86`、`PracticeRecords.tsx:134`。
- **空态** 10+ 处各自内联:tracker:816、discover:810、analytics:371/483、profile:649/709 等。
- **手搓浮层**(`fixed inset-0` 直写)实际约 **20 处**未迁 kit:admin/users:546、`GoalSettingWizard.tsx:83`、`EditSkillsDialog.tsx:101`、EditGoalsDialog:99、HistoryDetailDialog:35、discover:851、compare:747、cv/reference-viewer:146、cv/page.tsx ×3(1236/1241/1792)、evaluate/jds ×3(337/474/545)、interview ×2(499/506)、`AnalystCanvas.tsx:116`、`AgentDomainCards.tsx:140`、`shell/CommandPalette.tsx:91`、`shell/WorkbenchShell.tsx:533`。kit 自身除外。

同一个视觉改动今天要改 49+ 个地方。

## Solution

1. **三个新原语**(放 `src/components/ui/`):`PageHeading`(标题+说明+动作槽)、`SearchInput`(防抖+清空+快捷键,行为以 6 处现实现的最大公约数为准)、`EmptyState`(图标+标题+说明+主动作);12 页页头、6 处搜索、10+ 空态全部换装。
2. **浮层全迁**既有 overlay kit(grilling Q5:全迁,约 20 处不留尾巴);逐处核对语义(模态/非模态、ESC/遮罩关闭、焦点回归)与 kit 原语对齐,kit 缺能力先扩 kit 再迁,不在页面里写特例。`WorkbenchShell.tsx:533` 一处属外壳本体,迁移前单独确认语义(它是壳不是页)。
3. 视觉逐字节等价优先:换装是结构收敛,不是改版;确有样式不一致处(同一组件两页长得不一样),以 design kit 令牌为准并记录在 PR。

## User Stories

- 无用户可见变化(换装等价);改一处页头样式,12 页同时生效。

## Implementation Decisions

- 每迁一处删一处旧实现;不允许「新增原语但旧拷贝保留」的中间态进 dev。
- kit 原语接口保持最小(三原语各自 ≤5 个 props);页面特有需求走 children/slot,不给原语加页面专属 prop。
- `AgentDomainCards.tsx`(1898 行,热点第 5)只做浮层迁移这一件事,不趁机重构——它的拆分不在本轮范围。

## Testing Decisions

- 三原语渲染测试 + 关键交互(搜索防抖/清空、浮层 ESC/焦点)测试。
- 换装页面既有测试全绿;源码契约测试锁定「src/app 下不得再出现 `fixed inset-0` 直写浮层」与「page-heading 类名不得在 app 页面内联手写」两条(仿 2026-09 迁移的契约测试模式)。

## Out of Scope

- 五工作台的 WorkbenchKit 换装遗留(若仍有)不在本 spec;信任卡(33)、hook 拆分(35)、视觉改版(全部)。

## Further Notes

- 可与 spec 33 并行,**但 analytics/page.tsx 两边都动**(34 换页头/空态,33 加仪表盘区块)——该文件的改动需协调合并顺序,其余文件面互不相交。建议在 33 换装前完成,让信任卡直接用上收口后的页面骨架。
- 预估 1-2 天:原语半天,页头/搜索/空态换装半天,浮层约 20 处一天。

## 实施记录(2026-10-06,0.21.0)

- 实际换装:页头 11 处/11 文件 + 6 搜索 + 15 空态;浮层 15 处/13 文件(Dialog/AlertDialog/抽屉,内容零改动)。契约测试两条:page-heading 类与 fixed inset-0 均以正则+显式豁免清单锁定。
- **记录在案的跳过/豁免**:①页头 2 处(memory:h1 即边框盒;profile:无画像 hero)结构不符规范形,契约测试白名单+注释;②复杂空态(tracker hero/jds·reports motion 包装/interview 多段)保留;③AnalystCanvas 全屏工作面非模态,豁免于浮层白名单(既有 UI 测试固化);④SearchInput 未含 spec 文字中的防抖/快捷键——6 处旧实现均无防抖,按「最大公约数=清空」收敛,行为不变优先,防抖作为后续增强需连本地 state 改造。
