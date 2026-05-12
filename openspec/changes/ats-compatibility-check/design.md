## Context

ATS（Applicant Tracking System）用关键词匹配和结构解析来筛选简历。缺失联系方式、无量化数据、section 不完整都会导致直接淘汰。

## Decisions

- **方案**: prompt-based 检查，送 CV 全文给 DeepSeek，输出结构化检查清单
- **检查维度**: 联系方式、量化密度、关键词覆盖、section 完整性、格式问题（5 维）
- **输出格式**: JSON `{ issues: [{ dimension, severity, detail, fix }], score: 0-100 }`
- **工具注册**: 新增 `check_ats_compatibility` 工具
