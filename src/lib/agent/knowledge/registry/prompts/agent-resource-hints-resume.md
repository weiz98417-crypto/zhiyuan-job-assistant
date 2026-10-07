---
id: prompt.agent-resource-hints.resume
version: 1.0.0
source: spec-25 (replaces the localhost fetch hint; enumeration happens via tools at runtime)
lastReviewed: 2026-10-03
---

read_file(path='我的简历') — 读取你的完整简历
参考简历: read_file(path='参考简历/<名称>') — 先用列表类工具或让用户报出参考简历名称，再按名称读取；不要猜测名称。
