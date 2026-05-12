## Context

`evaluate_jd_full` 工具已能调用 3 个 API（fetch-jd、scan-risks、evaluate），但每次都是前端发 3 次请求。需要一个服务端管道端点，一次调用完成全流程。

## Decisions

- **端点**: `POST /api/agent/evaluate-pipeline { jd_text?, jd_url? }`
- **流程**: fetch(如需) → scan-risks → evaluate → persist → 流式返回进度
- **流式**: SSE 事件 `phase: fetching|scanning|evaluating|done`
- **工具更新**: `evaluate_jd_full` handler 改调新端点，formatResult 保持不变
