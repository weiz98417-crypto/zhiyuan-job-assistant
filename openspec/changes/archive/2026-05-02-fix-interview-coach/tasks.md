## 1. 类型与基础设施

- [x] 1.1 新增 `CoachMessage` 类型（role/content）到 types/index.ts
- [x] 1.2 新增 `POST /api/interview/coach/stream` SSE 流式端点（接受消息历史+模式，返回 section/followUps/done 事件）

## 2. 出题 Tab 数据源修复

- [x] 2.1 JD 选择器改为从 `db.jds` 加载数据（替代 `db.applications`）
- [x] 2.2 选中 JD 后传递 `jd.body` 作为 `jdText` 给 API
- [x] 2.3 调用 `getCVFullText()` 读取简历全文作为 `cvText`
- [x] 2.4 添加 CV 状态指示器（已就绪 / 为空提示）

## 3. 教练 Tab 多轮对话改造

- [x] 3.1 教练 Tab 改为对话式 UI（消息气泡列表 + 底部输入框）
- [x] 3.2 接入 `/api/interview/coach/stream` SSE 流式渲染
- [x] 3.3 首次对话组装 system message + user message
- [x] 3.4 追问按钮可点击，点击后作为下一条 user message 自动触发流式请求
- [x] 3.5 支持手动输入继续多轮对话
- [x] 3.6 消息历史超过 20 条时自动裁旧（前端 trimMessages + API 双保险）
- [x] 3.7 模式切换时清空对话历史并提示
- [x] 3.8 无消息时显示引导状态

## 4. 验证

- [x] 4.1 TypeScript 编译零错误
- [x] 4.2 教练流式 SSE 响应正常
- [x] 4.3 多轮对话上下文连贯
- [x] 4.4 追问点击触发新一轮对话
- [x] 4.5 出题 Tab 传递正确 JD 正文和简历文本
- [x] 4.6 现有评分功能不受影响
