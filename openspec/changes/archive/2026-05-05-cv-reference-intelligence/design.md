## Context

当前 CV 页面是双栏布局：左侧编辑器 + 右侧 JD 配对面板。JD 选择仅通过一个 `<select>` 下拉框，选中后展示匹配度和关键词。OptimizePanel 在每段 textarea 下展开，有激进程度/关键词密度两个 slider，但缺少对"当前针对哪个 JD" 的视觉提示。没有参考简历概念，AI 优化仅基于单个 JD 关键词。

项目已有 SQLite 后端（better-sqlite3），支持 FTS5 扩展。database 文件在 `data/zhiyuan.db`，schema 定义在 `server-schema.sql`。所有数据走后端 API，前端 DexieDB 仅做缓存。

## Goals / Non-Goals

**Goals:**
- 用户可以导入、存储、浏览优秀参考简历（PDF/图片解析或粘贴）
- CV 页面右侧面板始终展示当前 JD 上下文（不再只是下拉框）
- OptimizePanel 打开时显示"当前针对哪个 JD 优化"
- 可以并排对比同份简历的两个版本（diff 视图）
- AI 优化时自动检索参考简历库，丰富 LLM 上下文
- 用户 accept/reject 操作被记录，形成偏好历史

**Non-Goals:**
- 不引入向量数据库（pgvector/Chroma）——数据量 < 100 份，FTS5 足够
- 不自动爬取公开简历 —— 只处理用户手动导入的内容
- 不改变现有 CV 编辑区左侧的核心编辑逻辑
- 不改变 OptimizePanel 已有的三个 variant（激进/保守/定向）生成逻辑 —— 只在 prompt 层面增强

## Decisions

### Decision 1: SQLite FTS5 替代向量数据库

**选型**: SQLite FTS5 全文索引，不引入 pgvector/Chroma

**理由**:
- 参考简历量级：用户级 5-50 份，非百万级
- FTS5 做关键词粗筛（"用户增长" "A/B测试" "DAU"），LLM 直接读原文做精排
- 零新依赖，SQLite 已有 FTS5 支持
- 可审计：直接读原文而非向量分数
- LLM 128K 上下文可直接一次读入全部参考简历

**替代方案已否决**: pgvector（需额外服务、embedding 管线）、Chroma（Python 生态不相容）

### Decision 2: 参考简历与主简历数据同构

参考简历 sections 使用与主 CV 相同的 `CVSection[]` 结构存储：

```typescript
// 主简历：{ id, title, content }
// 参考简历：完全相同结构
interface ReferenceResume {
  id: number;
  name: string;           // 用户命名："腾讯PM简历"
  source: "upload" | "paste";
  sections_json: string;  // CVSection[] JSON
  raw_text: string;       // 全文拼接，供 FTS5 索引
  tags: string;           // JSON string[]: ["产品经理", "B端"]
  notes: string;
  created_at: string;
}
```

**好处**: 版本对比、section 粒度检索、与现有 cv-storage.ts 工具函数兼容

### Decision 3: FTS5 检索 + LLM 精读的混合检索

优化 API 的处理流程：

```
POST /api/cv/optimize-section
     │
     ├── 1. FTS5 用 sectionContent + JD keywords 检索参考简历
     │      SELECT * FROM reference_resumes
     │      WHERE reference_resumes_fts MATCH @query
     │      ORDER BY rank LIMIT 5
     │
     ├── 2. 提取匹配 section 的原文（从 sections_json 中找对应 sectionId）
     │
     ├── 3. 拼入 LLM prompt 的 "参考范例" 区域
     │      与 JD keywords 并列，形成双维度上下文：
     │      - JD 维度：激进程度/关键词密度控制 JD 匹配度
     │      - 参考简历维度：控制表达风格和结构
     │
     └── 4. LLM 生成优化版
```

### Decision 4: CV 页面右侧面板重构

```
BEFORE:                         AFTER:
┌─────────────────────┐        ┌─────────────────────────┐
│ JD 配对              │        │ 🎯 当前优化目标          │
│ [select dropdown]    │        │ ┌─────────────────────┐ │
├─────────────────────┤        │ │ 🏢 字节跳动          │ │
│ 匹配度: 73%          │        │ │ 📋 AI产品经理        │ │
│ 关键词匹配           │        │ │ 📊 匹配度: 73%       │ │
│ ...                  │        │ │ 🏷️ 关键词: [...]     │ │
└─────────────────────┘        │ │ [更换 JD]            │ │
                                │ └─────────────────────┘ │
                                ├─────────────────────────┤
                                │ 📚 参考简历              │
                                │ ☑ 腾讯PM简历            │
                                │ ☐ 阿里P7产品            │
                                │ [+ 导入]               │
                                ├─────────────────────────┤
                                │ 💡 匹配度 & 建议         │
                                │ (关键词匹配/缺失/反馈)   │
                                └─────────────────────────┘
```

### Decision 5: 版本对比实现

不引入第三方 diff 库，使用自定义逐行 diff（简历 section 粒度小，行数有限）：

```typescript
// 比较两个版本的 sections
function diffVersions(a: CVSection[], b: CVSection[]): SectionDiff[] {
  // 按 sectionId 对齐
  // 逐行 split('\n')，输出: { type: 'same'|'added'|'removed', text: string }[]
}
```

展示：左右两栏，左侧旧版（红色删除线），右侧新版（绿色高亮），底部统计摘要。

### Decision 6: Accept/Reject 偏好记录

新建轻量表 `optimization_preferences`：

```sql
CREATE TABLE IF NOT EXISTS optimization_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id TEXT NOT NULL,
  variant_type TEXT NOT NULL,   -- "激进" | "保守" | "定向"
  action TEXT NOT NULL,         -- "accept" | "reject"
  original_text TEXT,
  optimized_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

优化 prompt 时附带最近 10 条偏好，格式：
```
用户偏好历史：
- ✓ 接受了"激进"风格的量化改写（original→optimized）
- ✗ 拒绝了"保守"风格的措辞微调
```

## Risks / Trade-offs

- **[Risk] FTS5 中文分词精度不足** → Mitigation: 使用 FTS5 的 `unicode61` tokenizer + 对中文关键词做 `*` 前缀匹配；LLM 精读层可弥补分词缺陷
- **[Risk] PDF 解析依赖 AI，可能解析错误** → Mitigation: 提供手动编辑修正入口，导入后展示解析结果供确认
- **[Risk] 参考简历版权问题** → Mitigation: 仅用户手动导入的简历，不做公开抓取；在 UI 上添加提示"仅导入你自己的或已获授权的简历"
- **[Trade-off] 右侧面板内容量增加可能超出视口** → Mitigation: 使用 sticky 定位，各模块可折叠；JD 上下文字段始终可见，参考简历列表和匹配详情可折叠
