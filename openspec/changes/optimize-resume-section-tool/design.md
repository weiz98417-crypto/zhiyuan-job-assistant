## Context

`/api/cv/optimize-section` + judge-engine 已工作（CV 页面的优化面板在用）。Agent 聊天需要同样的能力，但做工具封装。

## Goals

- Agent 能调用 `/api/cv/optimize-section` 优化 CV section
- 数据从 SQLite 读（`GET /api/cv/data`），写回 SQLite（`PUT /api/cv/data`）
- localStorage 同步更新为 UI 缓存

## Data Flow

```
Agent → optimize_resume_section工具
  │
  ├─ GET /api/cv/data (SQLite) → current CV
  ├─ 提取目标 section (summary|experience|projects|education|skills)
  ├─ POST /api/cv/optimize-section { sectionId, sectionContent, fullCV, operation, effort }
  │     └─ judge-engine → DeepSeek V4 Pro → variants[]
  ├─ formatResult: 展示改写方案
  └─ (用户确认后) PUT /api/cv/data → 写回 SQLite + localStorage.setItem
```

## Intent Fix

当前 resume agent 的 intentPatterns 强制带"简历"关键词（如 `/优化.*简历/`）。用户说"开始优化""改写技能栏"时不会匹配。扩展为：
```
/优化|改写|润色/
```
