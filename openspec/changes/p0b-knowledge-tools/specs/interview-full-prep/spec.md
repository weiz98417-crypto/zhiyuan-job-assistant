## ADDED Requirements

### Requirement: Agent SHALL generate comprehensive interview preparation

`prepare_interview_full` 工具 SHALL 加载面试准备模式和 STAR 故事库，生成包含技术面、行为面、HR 面、群面题目 + 薪资谈判策略 + 反问建议的完整方案。

#### Scenario: 有目标公司

- **WHEN** Agent 调用 `prepare_interview_full({ company: "字节跳动", role: "AI产品经理" })`
- **THEN** 工具加载 `modes/zh/interview-prep.md` 和 `interview-prep/story-bank.md`
- **AND** 返回 4 类面试题目 + 针对性薪资谈判策略 + 反问建议

#### Scenario: 无目标公司

- **WHEN** Agent 调用 `prepare_interview_full({})`
- **THEN** 返回通用面试准备框架
- **AND** 提示 LLM "请根据用户的具体情况追问目标公司"

#### Scenario: 资源不可用

- **WHEN** `modes/zh/interview-prep.md` 不存在
- **THEN** 返回 `{ success: false, error: "面试准备系统暂不可用" }`
