## Context

当前系统通过 IndexedDB（Dexie.js）存储 `applications`、`reports`、`offers`、`stories`、`interviews` 五张表。评估页面（`/evaluate`）的流程是：输入 JD → AI 评估 → 生成报告存到 `reports` 表 → 可选添加到 `applications` 追踪。但 JD 原文本身没有独立存储，每次评估后 JD 内容就丢失了。

用户需要一个 JD 库来：
- 回顾历史录入的 JD
- 在投递前对比多个 JD
- 管理 JD 与评估报告的关联关系
- 支持从文字粘贴、OCR 识别等多种渠道录入

## Goals / Non-Goals

**Goals:**
- 新增 `jds` 表存储 JD 原文及元数据
- 提供 JD 卡片列表页，支持搜索和筛选
- JD 与 reports 通过 `reportId` 关联
- 支持查看详情、编辑、删除
- 评估完成后可一键保存到 JD 库
- URL 仅作为可选的"来源链接"字段，不做自动抓取

**Non-Goals:**
- 不实现 URL 自动抓取 JD 内容（国内网站反爬严重，已在探索阶段确认放弃）
- 不实现批量 JD 对比功能（属于 Offer 对比或其他能力）
- 不修改现有评估 API 的核心逻辑

## Decisions

### D1: IndexedDB 新表 `jds`（Dexie.js v2 migration）

**选择**: 新增 `jds` 表，字段包括 `id, company, role, sourceType, sourceUrl, body, keywords, reportId, createdAt`

**替代方案**:
- 方案 B: 在 `reports` 表加 `jdBody` 字段。问题：一对多关系（一个 JD 可评估多次），污染报告表。
- 方案 C: localStorage 存 JD。问题：容量限制，不支持索引查询。

**理由**: IndexedDB 已有成熟基础设施，Dexie.js migration API 稳定，独立的 `jds` 表语义清晰，支持按公司/职位/时间索引查询。

### D2: JD来源字段 `sourceType`

| 值 | 含义 |
|----|------|
| `"paste"` | 用户手动粘贴 |
| `"ocr"` | OCR 图片识别 |
| `"url"` | URL 链接（仅记录来源，不抓取内容） |

**理由**: 追溯 JD 来源有助于数据质量管理（如 OCR 识别内容需人工复核）。

### D3: JD → Report 关联方式

`jds.reportId` 是可选的单向外键，指向 `reports.id`。一个 JD 可被评估多次（生成多个 report），只保留最近一次关联。

**替代方案**:
- 方案 B: `reports` 表加 `jdId`。问题：评估时 JD 未必已在库中。
- 方案 C: 多对多关联表。过度设计，YAGNI。

**理由**: 保持简单，从报告保存到 JD 库时建立关联。报告有 `reportId`，JD 库引用它。

### D4: JD 列表页路由 `/evaluate/jds`

在现有 `/evaluate` 页面增加子导航（Tab 或侧边链接），不需要新增顶级导航。评估页已经是"JD 管理"（AppShell 已改名），子页面保持同一上下文。

**理由**: 保持导航层次清晰，JD 管理作为评估流程的一部分而非独立领域。

### D5: 搜索和筛选

前端实现，不使用后端搜索：
- **搜索**: 搜索 `company`、`role`、`body` 字段（`body` 使用 `includes` 模糊匹配）
- **筛选**: 按 `sourceType`（paste/ocr/url）、是否有关联报告（`reportId` 是否为空）
- **排序**: 按 `createdAt` 降序（最新在前）

**理由**: JD 数据量级（百级），前端搜索完全够用，无需额外 API。

## Risks / Trade-offs

- **JD 正文较大（<8KB），IndexedDB 存储没问题，但卡片列表需要截断显示（前200字）**
- **搜索全表扫描在 JD 数量 < 1000 时性能无问题，超过后可加 Web Worker 或迁移到后端**
- **JD 可能包含 HTML/富文本残留（来自 cheerio 抓取），存储前需清洗为纯文本**
