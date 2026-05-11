## ADDED Requirements

### Requirement: Agent SHALL perform multi-dimensional offer comparison

`compare_offers_deep` 工具 SHALL 接收 2+ 个 offer 数据，输出 6 维对比（薪资、职级、成长、稳定性、文化、地点）+ 税后实得计算 + 加权推荐 + 谈判策略。

#### Scenario: 两个 offer 对比

- **WHEN** Agent 调用 `compare_offers_deep({ offers: [{ company: "字节", salary: "30K*15" }, { company: "美团", salary: "28K*16" }] })`
- **THEN** 输出 6 维评分表 + 税后实得对比 + 加权总分
- **AND** 明确指出推荐选项及理由

#### Scenario: offer 数据不足

- **WHEN** 只提供 1 个 offer 或 offer 数据缺失关键字段（薪资）
- **THEN** 返回 `{ success: false, error: "至少需要 2 个 offer 且包含薪资信息" }`
