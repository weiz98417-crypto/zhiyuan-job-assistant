## Context

当前 CV 页面 (`src/app/cv/page.tsx`) 使用 `useState<CVSection[]>` 管理 5 个 section，每次编辑直接写入 `localStorage` (`lingji-ai-cv`)，结构为扁平的 `CVSection[]`。没有版本概念、没有显式保存按钮。评估 API (`/api/evaluate`) Block B 无法读取 CV 数据——因为 CV 只存在于浏览器 localStorage 中，API route 无法访问。

目标是从 `openspec/plans/cv-ai-optimize-design.md` 中抽取版本管理部分先实现，为后续 `cv-ai-optimize` 变化铺路。

## Goals / Non-Goals

**Goals:**
- 版本化的 CV 数据结构：`{ activeVersion, versions: { [id]: CVersion } }`
- 版本 CRUD：创建、切换、重命名、删除（至少保留一个）
- 旧数据平滑迁移：首次加载时检测旧 `CVSection[]` 格式，自动包装为 v1
- 显式保存按钮：手动保存而非 auto-save，支持「未保存更改」提示
- 服务端 CV 读取端点 `GET /api/cv`，返回活跃版本内容
- 评估 API 注入 CV 内容参与匹配，无 CV 时 Block B 返回合理占位

**Non-Goals:**
- AI 逐段优化（属于 `cv-ai-optimize`）
- 版本差异对比（属于 `cv-ai-optimize` 的衍生需求）
- PDF 生成模板改造
- 多语言 CV 版本

## Decisions

### Decision 1: localStorage 数据模型

采用 `openspec/plans/cv-ai-optimize-design.md` 第 217-237 行定义的结构：

```typescript
interface CVSection {
  id: string;       // "summary" | "experience" | "projects" | "education" | "skills"
  title: string;
  content: string;
}

interface CVersion {
  id: string;              // "v1", "v2", ...
  label: string;           // 用户命名，如 "后端方向"
  createdAt: string;       // ISO timestamp
  sections: CVSection[];
  source: "manual" | "optimized";  // 来源标记（为 cv-ai-optimize 预留）
}

interface CVData {
  activeVersion: string;
  versions: Record<string, CVersion>;
}
```

**为何不用 IndexedDB**: CV 数据量小（5 个 textarea），不需要索引查询。localStorage 同步读写简单可靠，且 CV 数据是评估时拼入 prompt 的文本，不需要数据库级别的事务保证。

### Decision 2: 旧数据迁移策略

首次加载时 `localStorage.getItem("lingji-ai-cv")` 的检测逻辑：

```
if (parsed is Array) → 这是旧格式 → 自动包装为:
  { activeVersion: "v1", versions: { "v1": { id:"v1", label:"初始版本", createdAt: now, sections: parsed, source: "manual" } } }
  写回 localStorage，然后继续使用新格式
```

**为何不创建独立 migration key**: 迁移是幂等的——包装后写回覆盖旧 key，下次读取就是新格式。不需要额外标记。

### Decision 3: CV 数据如何到达评估 API

两条路径：

1. **服务端主动读取** — `GET /api/cv` 从请求的 cookie/header 无法获取 localStorage，所以这条路走不通。服务端没法读浏览器 localStorage。
2. **前端传入** — 评估时前端从 localStorage 读取活跃版本，与 `userProfile` 一样拼入 request body。

选择路径 2。具体做法：
- 前端 `handleSubmit` 已从 localStorage 读取 `lingji-ai-profile` 传入
- 新增：从 localStorage 读取 `lingji-ai-cv`，提取 `activeVersion` 对应的 sections，拼成全文字符串传入 `cvText` 字段
- API prompt 中注入 CV 全文到 Block B 分析
- 无 CV 数据时，Block B prompt 指示 AI 输出占位文本而非猜测

`GET /api/cv` 端点仍然创建，用于：
- PDF 生成（服务端需要 CV 内容渲染 HTML）
- 未来可能的服务端缓存场景

但评估流程走前端传入路径。

### Decision 4: 版本选择器 UI 位置

页面顶部，标题下方。布局：

```
[当前版本: v2 · 后端方向 ▾]  [保存] [+ 新建版本]
```

下拉菜单中每行显示：版本名称 + 创建日期 + 删除按钮（v1 不显示删除）。

### Decision 5: 保存行为

- 初次加载后 tracking 原始内容 hash
- 用户编辑后「保存」按钮从灰色变为可点击（主色）
- 点击保存 → 写入 localStorage → 按钮恢复灰色
- 切换版本前检查未保存更改 → 弹窗确认（「放弃更改？」）
- 不再自动保存

## Risks / Trade-offs

- **[Risk] 用户清除浏览器数据会丢失所有 CV 版本** → 短期接受（其他 data 也存 localStorage/IndexedDB）。长期可通过 `/api/cv` POST 做服务端持久化。
- **[Risk] localStorage 5MB 限制** → CV 文本量远小于 5MB，暂时不需要担心。
- **[Trade-off] 不用 IndexedDB** → 牺牲了查询能力，换取了实现简单性。CV 数据不需要查询。
