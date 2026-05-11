## 1. 流式架构统一

- [x] 1.1 扩展 `createStructuredStream`：支持 `messages` 数组参数（多轮对话）替代单一 `userMessage`，新增 `sectionExtractor` 回调让调用方自定义内容提取逻辑
- [x] 1.2 在 `stream-utils.ts` 新增 `extractSectionsFromBuffer` 工具函数——用 `<<SECTION>>([\s\S]*?)<</SECTION>>` 正则提取，从 markdown heading 推导 section key
- [x] 1.3 重构 `coach/stream/route.ts`：复用 `createStructuredStream`，删除内联的 fetch/chunk/emitPendingSections/tryExtractFollowUps 逻辑，仅保留 coach 特有的 `tryExtractFollowUps` + `tryExtractRiskWarnings` + raw fallback

## 2. 格式放宽与 Raw Fallback

- [x] 2.1 修改 coach system prompt：`<<SECTION>>` 替代 `<<SECTION_<key>>##`，要求 AI 在内容中用 `### 标题` 标注段落
- [x] 2.2 实现 raw fallback：stream close 时如果 sectionsEmitted === 0，将 buffer 作为 `raw` section 发出
- [x] 2.3 客户端 `parseSSEStream` 处理 `key: "raw"` 的 section 事件，作为普通 AI 消息展示

## 3. 练习对话 UX 修复

- [x] 3.1 移除 `PracticePanel` 的 auto-bootstrap useEffect（第 66-73 行）
- [x] 3.2 首次练习空状态：显示题目卡片 + 输入框 + 提示文字"输入你对于这道题的回答..."，不加 loading
- [x] 3.3 `isRePractice` 模式下保留已有消息历史，不自动发消息
- [x] 3.4 用户提交第一条消息时，发送内容作为 user message（不再是引导消息），API 将返回对该回答的结构化反馈

## 4. 保存逻辑修复

- [x] 4.1 修改 `PracticePanel.handleSave`：answer 只取用户消息内容（`messages.filter(m => m.role === "user")`）
- [x] 4.2 无用户消息时禁用 [保存到题库] 按钮或隐藏

## 5. 验证

- [x] 5.1 TypeScript 编译零错误
- [x] 5.2 出题 → 练习 → 输入回答 → AI 流式反馈正常（含 section 展示 + 追问 + raw fallback）
- [x] 5.3 保存后 answer 字段为用户回答内容（非 AI 反馈）
- [x] 5.4 重新练习保留历史消息
- [x] 5.5 现有 evaluate/jd 流式评估不受影响
