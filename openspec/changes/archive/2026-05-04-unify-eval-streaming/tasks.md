## 1. SSE 流式评估端点

- [x] 1.1 创建 `frontend/src/app/api/evaluate/stream/route.ts`，实现 SSE 响应（ReadableStream + TextEncoder）
- [x] 1.2 实现 modes 文件读取：读 modes/zh/_shared.md 和 jianzhi.md，按 A-G block 拆分规则
- [x] 1.3 实现 Phase 0 三种输入：文本直接用、URL 用 cheerio 抓取、截图调智谱 GLM-4V 逐张识别 → emit phase/ocr_progress/jd_extracted
- [x] 1.4 实现 OCR 子模块：串行逐张调 GLM-4V，合并 body，推送 ocr_progress
- [x] 1.5 实现 Phase 0.5 archetype 检测（短 prompt，DeepSeek）
- [x] 1.6 实现 Block A-G 分块流式编排：每块独立 system prompt + DeepSeek stream:true → block_chunk → block_done
- [x] 1.7 实现 Block D 搜索增强：WebSearch → search_start/search_result → 结果注入 prompt
- [x] 1.8 实现 post-eval 结果暂存（不自动写文件，待 HITL 确认）
- [x] 1.9 错误处理：单 block 失败不阻断后续；单张截图失败不阻断整体；连接断开终止

## 2. useEvaluationStream Hook（Agent Chat 专用）

- [x] 2.1 创建 `frontend/src/lib/use-evaluation-stream.ts`，封装 SSE fetch + ReadableStream reader
- [x] 2.2 实现 `start(input)` — 接受 { jdText?, jdUrl?, images?: string[] }
- [x] 2.3 状态聚合：phase / ocrProgress / blocks({status,content,score}) / searchResults / overallScore / reportPath / error
- [x] 2.4 `abort()` 支持

## 3. Agent Chat 改造（核心）

- [x] 3.1 改造 `prompt.ts` 的 AGENT_CORE_PROMPT：增加 modes 知识摘要（A-G 板块、archetype、中国市场规则、评分体系）
- [x] 3.2 输入区增加 `+` 按钮：点击打开文件选择器（png/jpeg/webp，多选，最多 5 张），支持 Ctrl+V 粘贴截图
- [x] 3.3 截图缩略图预览：输入区上方展示带编号缩略图，可单张移除
- [x] 3.4 「评估JD」chip 混合模式：点击后填入提示词 + placeholder 切换为「粘贴 JD 文本或链接...」+ `+` 按钮 2 秒脉冲动画
- [x] 3.5 改造 `evaluate-jd.ts` 工具 handler：调 `/api/evaluate/stream`，支持 jdText/jdUrl/images 参数
- [x] 3.6 实现 `AgentEvalCard` 组件：消费 useEvaluationStream，对话中实时展示评估进度
- [x] 3.7 实现 HITL 确认按钮组：评估完成后在 Agent 回复下方展示「保存到 JD 库」「加入投递追踪」「放弃」三个按钮，用户点击后才持久化
- [x] 3.8 实现按钮状态管理：点击后按钮变为已确认状态（✓），Agent 追加确认消息；低分岗位（<3.5）加入追踪时给出温和提示
- [x] 3.9 Agent 评估完成后生成自然语言摘要（亮点 + 风险 + 建议）

## 4. /evaluate 页面降级为管理页

- [x] 4.1 移除 `evaluate/page.tsx` 中的输入区、Tab 切换、loading 动画、报告渲染
- [x] 4.2 `/evaluate` 首页改为管理概览：JD 库统计 + 报告库统计 + 快捷入口（跳 Agent Chat、JD 库、报告库）
- [x] 4.3 空状态引导：「还没有评估记录。前往 Agent Chat 开始第一次评估 →」
- [x] 4.4 `/evaluate/jds`、`/evaluate/reports`、`/evaluate/history` 保持不变

## 5. 数据层统一

- [x] 5.1 `/api/evaluate/stream` 评估结果暂存在响应中（不自动写文件），待用户在前端确认后由前端触发生成报告文件和更新追踪表
- [x] 5.2 实现保存 API：`POST /api/report/save` 接收评估结果 JSON + 用户确认的操作类型，写入 reports/*.md 和/或 applications.md
- [x] 5.3 `/api/data/import` 增强从文件系统同步到前端 IndexedDB
- [x] 5.4 前端启动时静默同步

## 6. 验证

- [x] 6.1 Agent Chat：粘贴 JD 文本 → evaluate_jd 工具 → 流式卡片 → 评估完成 → Agent 总结
- [x] 6.2 Agent Chat：+ 上传 5 张截图 → OCR 逐张识别 → 合并 JD → 流式评估 → Agent 总结
- [x] 6.3 Agent Chat：评估完成后追问（"薪资合理吗？""帮我改简历"）
- [x] 6.4 `/evaluate`：展示为管理概览，JD 库和报告库正常
- [x] 6.5 CLI modes 未被修改，CLI Agent 仍正常工作
