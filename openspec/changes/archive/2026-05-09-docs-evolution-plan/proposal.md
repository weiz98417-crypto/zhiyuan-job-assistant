## Why

项目已完成 8 个 OpenSpec change 实施，但缺少系统性的技术文档。参照"球球演进计划"的文档颗粒度，需要建立一套覆盖架构、功能、实现细节的演进文档。

## What Changes

在 `docs/evolution/` 目录下创建 10 份技术文档：

| # | 文档 | 覆盖内容 |
|---|------|---------|
| 00 | 演进计划总览 | 愿景、路线图、核心指标 |
| 01 | 技术选型与架构设计 | 技术栈、系统架构图、关键决策 |
| 02 | Claude Agent 模式系统 | Mode 文件机制、评分引擎、语言路由 |
| 03 | JD 评估引擎 | A-G 7 维评估流程、评分算法 |
| 04 | 风险识别引擎 | 两层检测、加权计分、知识库 |
| 05 | 求职画像系统 | CV、Profile、Archetype、叙事 |
| 06 | 前端架构设计 | Next.js 16、设计系统、Agent 系统 |
| 07 | 数据层设计 | SQLite、DATA_CONTRACT、迁移 |
| 08 | Agent 互通机制 | Claude ↔ Next.js 上下文共享 |
| 09 | 脚本工具链 | 9 个 .mjs 脚本完整文档 |

## Capabilities

### New Capabilities
- `evolution-docs`: 10 份演进文档，覆盖全项目架构和功能
