## Context

系统通过 `reports` 表（IndexedDB）存储所有评估报告，每条报告包含 A-G 模块内容、评分、公司名、职位名、关键词等字段。当前评估结果页（`/evaluate`）只展示当前评估的报告，缺少历史报告浏览和管理能力。

用户需要一个报告管理界面来回顾和对比所有评估过的职位，并与 JD 库形成联动。

## Goals / Non-Goals

**Goals:**
- 报告卡片列表，展示关键信息（公司、职位、评分、日期、archetype）
- 搜索：按公司名、职位名、关键词搜索
- 筛选：评分范围、时间范围、archetype
- 排序：按评分、按日期
- 报告详情查看（复用 A-G 模块渲染）
- 删除报告，级联清理 JD 关联
- JD↔报告双向导航

**Non-Goals:**
- 不修改报告存储结构（现有 `reports` 表足够）
- 不实现报告导出（PDF/Markdown）——属于其他能力
- 不实现报告对比功能

## Decisions

### D1: 路由设计

报告列表页放在 `/evaluate/reports`，与评估页 `/evaluate` 和 JD 库页 `/evaluate/jds` 形成三级子导航。

```
/evaluate          → 评估输入页（现有）
/evaluate/jds      → JD 库列表（jd-library-management）
/evaluate/reports  → 报告列表（本 change）
```

**理由**: 保持"JD 管理"作为统一入口，子页面在同一上下文下切换。

### D2: 报告详情查看方式

使用 **侧边面板（Sheet/Drawer）** 而非跳转新页面。点击报告卡片 → 右侧滑出详情面板 → 复用现有 A-G 模块渲染组件。

**替代方案**:
- 方案 B: 跳转独立详情页 `/evaluate/reports/:id`。问题：导航复杂，用户需要来回跳转。
- 方案 C: 在当前页展开 inline。问题：长内容破坏列表布局。

**理由**: 侧边面板是浏览型场景的最佳体验——列表维持上下文，详情按需查看。

### D3: 搜索和筛选实现

前端全量查询，不使用后端搜索：

- 从 `db.reports` 加载全部报告到内存
- `useMemo` 计算过滤结果（搜索 + 筛选 + 排序）
- 报告量级（千级以内），性能安全

**理由**: 与 JD 库一致的前端搜索策略，无需额外 API。

### D4: 删除报告级联策略

删除报告时：
1. 从 `reports` 表删除记录
2. 查询 `jds` 表中 `reportId === deletedReport.id` 的记录
3. 将该 JD 记录的 `reportId` 设为 `undefined`（解除关联，不删除 JD）

**理由**: JD 和报告是独立资产，删除报告不应删除 JD。

### D5: JD↔报告双向导航

- 报告卡片: 显示"查看 JD"链接（当 `reportId` 在 `jds` 表中有匹配时）
- JD 详情: 显示"查看报告"链接（当 `jd.reportId` 不为空时）

通过 Dexie.js 的索引查询实现关联查找。

## Risks / Trade-offs

- **报告详情面板在移动端需改为全屏模式**：使用 `useMediaQuery` 或 CSS breakpoint 检测
- **全量加载报告列表随数据增长可能变慢**：千条以内 OK，超过后加虚拟滚动或分页
