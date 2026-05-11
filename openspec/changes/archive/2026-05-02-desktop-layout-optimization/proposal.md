## Why

桌面端（1280px+）内容区仅占屏幕 47-62%，大量空白浪费屏幕空间。评估输入框在宽屏上只有一小条，评估报告 A-G 7 个 block 全竖排堆叠，CV 编辑区与 JD 配对面板在小屏塌缩后无法同时查看。核心问题：**所有页面都硬编码了保守的 `max-w-2xl/3xl/4xl`，且没有在 XL 屏上利用多栏布局。**

## What Changes

### 全局放宽
- AppShell 内容区 `max-w-4xl` → `max-w-6xl` (1152px)，给所有页面更多呼吸空间
- 页面级别的 `max-w-2xl/3xl` 同步放宽到合理宽度

### 大屏多栏利用
- **评估输入页** (`/evaluate`): XL 屏 (1280px+) 输入区与辅助面板（历史/快捷操作）并排双栏
- **评估报告页** (`/evaluate` report view): XL 屏报告 blocks (左) + 深度分析/操作 (右) 双栏
- **CV 管理页** (`/cv`): XL 屏编辑区更宽，右侧 JD 配对面板保持固定宽度可见
- **JD 库** (`/evaluate/jds`): 卡片 grid 响应式升级：`md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3`
- **报告浏览** (`/evaluate/reports`): 卡片 grid 同样升级 + XL 屏下详情抽屉改为侧边面板

### 不影响
- 移动端 Tab Bar 和布局保持不变
- 设计系统 token（色彩、字体、动画）不变
- 所有功能逻辑不变，纯布局调整

## Capabilities

### Modified Capabilities
- `frontend-shell`: AppShell 内容区最大宽度和响应式行为变更
- `jd-evaluation-ui`: 评估输入页和报告页的布局在 XL 屏上改为双栏
- `cv-optimization-ui`: CV 编辑页 grid 在 XL 屏上改为更宽的主编辑区
- `jd-library-ui`: JD 库卡片 grid 增加 xl 断点列数
- `report-browsing-ui`: 报告浏览卡片 grid 增加 xl 断点列数

## Impact

- `AppShell.tsx`: 修改 `max-w-4xl`，添加 xl 断点逻辑
- `evaluate/page.tsx`: 输入视图和报告视图的 wrapper 宽度 + XL 双栏布局
- `evaluate/jds/page.tsx`: 卡片 grid 添加 xl 断点
- `evaluate/reports/page.tsx`: 卡片 grid + 详情面板布局
- `cv/page.tsx`: Grid 布局 `xl:grid-cols-[1fr_320px]` 风格
- `globals.css`: 可能添加 xl 断点的 CSS 自定义属性
