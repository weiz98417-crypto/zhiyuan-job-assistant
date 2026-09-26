# 0032 - WorkbenchShell slot 外壳与一趟精装车(0.12.0)

Date: 2026-09-26

## Status

Accepted

## Context

0.11.0 落地了令牌系统与双面画布,但外壳仍是三层各自为政:AppShell(硬编码导航、内联用户/登出/主题/门控)、/agent 自装的旅程栏(桌面双左栏、移动三套导航)、16+ 处手搓浮层与五个工作台各自重写的头部/筛选/空态。产品的"毛坯感"主要来自外壳,而非对话脸。

ADR-0031 的分期哲学是"库替换与语义工作不同车"。本次是纯 UI 层重构(不动事件方言、transcript 单写者、admission),但工程量大(C1–C5 六个候选全部实施)。

## Decision

1. **WorkbenchShell 成为全站唯一外壳 module**:interface = 三个 slot(nav / rail / content)+ 折叠态 + 移动 Sheet;合入 shadcn/ui sidebar.tsx 作 copy-in 原语(radix 已在依赖树,显式声明进 package.json)。旅程栏是 /agent 的 rail slot;admin 与用户页共用同一外壳,nav slot 数据驱动。
2. **/agent 站点导航收窄为图标栏(64px 可折叠)**,旅程栏保留为第一栏——双左栏消失,折叠偏好持久化。
3. **移动端收敛为两套**:底部 tab(高频操作)+ 旅程/完整导航 Sheet。
4. **可拖拽分栏只给分析面**(react-resizable-panels);对话脸恒定窄列是 ADR-0031 语义,不是布局参数。
5. **编排下沉**:useAgentConversation(纯 React hook,单消费者,不上 zustand)+ AgentJourneyEffects;/agent 页面缩到组装层。
6. **Overlay kit 与 Workbench kit 当趟全量迁移**:dialog/sheet/alert-dialog copy-in 替换全部手搓浮层;PageHeader/FilterChips/EmptyState/ResultGrid 换装五个工作台;不做豁免名单。
7. **图表换 recharts(shadcn chart)**;孤儿 RadarChart(全仓无引用)删除。
8. **⌘K 全局化**:键位由外壳持有,所有页面唤起同款面板。
9. **测试策略**:UI 断言借迁移从源码字符串契约换为渲染测试;仅钉领域文案的 contract 保留。
10. **一趟车**:C1–C5 合并为一趟 0.12.0 发布(openspec 变更包 `e-workbench-shell`,五段施工 S1–S5,段内测试门)。这**违背 ADR-0031 的分期哲学**,理由:六个候选全是 UI 层、无语义耦合,且段间有硬依赖(C1 的 slot seam 是 C2 的承接面),分期反而造返工;回滚粗粒度以发车前打 tag `v0.11.0-final` 锚定。
11. **底图**:用户提供位图背景,接入外壳背景层,透明度由令牌控制;位图到位前先上纯 CSS 纸纹噪点占位,替换走同一层。

## Consequences

全站只有一条外壳实现路径,折叠/移动端/可达性行为有唯一落点;UI 测试从"代码里写过这行字"升级为"界面上真的这样渲染"。一趟车的回滚粒度是整趟——tag 是锚,不是保险;若 S2 编排下沉受阻,允许段内单独回退该段(车内纪律,不是分批发布)。ADR-0031 的分期哲学仍然有效,本 ADR 只对纯 UI 层重构开此一例。
