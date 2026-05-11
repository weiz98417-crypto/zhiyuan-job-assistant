## ADDED Requirements

### Requirement: CV 数据 API

系统 SHALL 提供服务端端点 `GET /api/cv`，返回当前活跃 CV 版本的内容。

#### Scenario: 成功返回 CV 数据

- **WHEN** 客户端发送 `GET /api/cv` 请求
- **AND** 请求 body 中包含 `sections`（前端从 localStorage 读取后传入）
- **AND** 可选包含 `template` 参数指定渲染模板
- **THEN** 返回 `{ success: true, data: { sections: [...], fullText: "..." } }`

#### Scenario: CV 数据为空

- **WHEN** 请求 body 中 sections 全部为空内容
- **THEN** 返回 `{ success: true, data: { sections: [...], fullText: "", isEmpty: true } }`

### Requirement: 评估 API 集成 CV 数据

评估 API SHALL 接收前端传入的 CV 全文，注入 Block B 分析 prompt。

#### Scenario: 有 CV 数据时

- **WHEN** 前端在评估请求 body 中传入 `cvText` 字段（非空字符串）
- **THEN** API 将 CV 内容拼入 Block B prompt，要求 AI 基于 CV 原文进行匹配分析
- **AND** Block B 输出包含具体的「覆盖 / 缺失 / 薄弱」关键词标注

#### Scenario: 无 CV 数据时

- **WHEN** 前端在评估请求 body 中未传入 `cvText` 或为空字符串
- **THEN** API 提示 AI 在 Block B 中输出一段说明文字：「尚未提供简历数据，无法进行简历匹配分析。请在简历优化页面完善简历后重新评估。」
- **AND** Block B 的评分 `b` 应为 0 而非捏造分数
