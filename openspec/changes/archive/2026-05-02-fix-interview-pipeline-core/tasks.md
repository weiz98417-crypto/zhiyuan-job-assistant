## 1. SSE 解析健壮化

- [x] 1.1 重写 `PracticePanel.parseSSEStream`：用行缓冲替代 `split("\n")`，保留 chunk 末行 fragment 拼接到下一 chunk
- [x] 1.2 重写 `coach/stream/route.ts` 流式循环：确保 chunk 拼接在服务端正确、`[DONE]` 标记后刷新残留 buffer
- [x] 1.3 验证 SSE 解析在以下场景正常工作：单 chunk 多事件、data 行跨 chunk 截断、空 chunk、`<<SECTION_>>` 标签跨 chunk

## 2. 配置区响应式刷新

- [x] 2.1 修改 `interview/page.tsx` 配置区 JD 列表加载逻辑：从 mount-only 改为展开配置区时刷新
- [x] 2.2 CV 状态指示器改为展开配置区时重新校验 `isCVEmpty()` 和 `getCVFullText()`
- [x] 2.3 确保 `generateQuestions` 内部已调用最新 CV（当前已有，确认无误）

## 3. 练习面板自动引导

- [x] 3.1 在 `PracticePanel` 添加 `useEffect`：question 非 null + messages 为空时自动发送引导消息
- [x] 3.2 引导消息格式：包含题目文本 + 请求教练先分析考察点再引导组织回答
- [x] 3.3 首次练习 vs 重新练习区分：`practicedMap` 标记已练习过的题目不自动引导

## 4. 出题 API 接入 Stories

- [x] 4.1 `/api/interview/generate` 新增可选 `storiesContext` 参数
- [x] 4.2 System prompt 增加 stories 参考段落，限制最多 5 个故事
- [x] 4.3 前端 `generateQuestions` 从 `db.stories` 读取故事并传入 API

## 5. 练习记录→故事转换

- [x] 5.1 PracticeRecords 展开详情增加 `[转为 STAR 故事]` 按钮
- [x] 5.2 点击后打开故事编辑器，预填标题（从题目关键词提取）和内容（从 Q&A 提取）
- [x] 5.3 保存后刷新 stories 列表和统一视图

## 6. 验证

- [x] 6.1 TypeScript 编译零错误
- [x] 6.2 Pipeline 全流程实测：展开配置→刷新 JD/CV→生成题目→练习（自动引导）→AI 流式输出正常→保存→查看记录→转为故事
- [x] 6.3 SSE chunk 边界测试：大响应（4+ sections）流式输出无截断
- [x] 6.4 配置区刷新测试：切换页面新增 JD 后回来展开配置区 JD 列表已更新
