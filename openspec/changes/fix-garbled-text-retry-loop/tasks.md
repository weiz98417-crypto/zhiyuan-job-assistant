## 1. 乱码检测工具函数

- [x] 1.1 创建 `src/lib/agent/loop/text-quality.ts`,实现 `isGarbledText(text: string): boolean`
- [x] 1.2 实现 U+FFFD 替换字符密度检测(阈值 0.5%)
- [x] 1.3 实现 C1 控制字符(0x80-0x9F)密度检测(阈值 1%)
- [x] 1.4 实现中文文本拉丁乱码检测(长度>100, CJK<5%, Latin Extended>30%)
- [x] 1.5 空文本和纯空白返回 false(由 checkResultQuality 的 "empty" 分支处理)
- [x] 1.6 导出 `isGarbledText` 供 `import-reference/route.ts` 等服务端代码复用

## 2. 扩展 checkResultQuality + 智能降级

- [x] 2.1 在 `src/lib/agent/loop/types.ts` 中扩展 ResultQuality 类型,新增 "garbled"
- [x] 2.2 在 `client-runner.ts` 的 `checkResultQuality()` 中调用 `isGarbledText()`,在 empty/irrelevant 检查之后检查 garbled
- [x] 2.3 在 `server-runner.ts` 的 `checkResultQuality()` 中同步修改
- [x] 2.4 quality === "garbled" 时不增加 `autoRetryCount`
- [x] 2.5 文件读取类工具(name 含 `get_reference`/`Read`)garbled → recoverable=false → 直接 responding + 用户引导消息
- [x] 2.6 非文件读取类工具 garbled → 允许 1 次 fallback 尝试,再失败才降级

## 3. docx 导入路径治本——mammoth → Qwen-Long fallback

- [x] 3.1 在 `import-reference/route.ts` 的 mammoth 提取 docx 后(第 193 行),用 `isGarbledText(rawText)` 检测
- [x] 3.2 若乱码,调用 `extractViaQwenLong(fileBuffer, file.name)` 重新提取
- [x] 3.3 Qwen-Long 提取成功后正常走 DeepSeek 解析 → 写入数据库
- [x] 3.4 Qwen-Long 也失败时返回明确错误信息给前端

## 4. get_reference_detail 工具内容校验

- [x] 4.1 在 `get-reference-detail.ts` 的 `formatResult()` 中,解析 sections 后对每个 section content 调用 `isGarbledText()`
- [x] 4.2 若任一 section 为乱码,formatResult 返回明确错误信息,不将乱码内容传入 LLM 上下文

## 5. 验证

- [x] 5.1 用已知中文乱码样本(GBK 文本被当作 UTF-8 读取的典型输出)测试 `isGarbledText()` 准确性
- [x] 5.2 上传一个编码异常的 docx 参考简历,验证 mammoth→Qwen-Long fallback 链路正常,乱码不入库
- [x] 5.3 在 Agent 对话中查询已知乱码的参考简历,验证 Agent 不进入重试循环,直接引导用户
- [x] 5.4 确认正常编码的 docx/PDF 上传不受影响,流程正常
- [x] 5.5 确认正常搜索结果的 empty/irrelevant 重试机制不受影响
