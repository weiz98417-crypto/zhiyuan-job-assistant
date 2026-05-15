## Why

用户上传中文 docx 参考简历后,Agent Loop 进入灾难性失败循环。根因有两层:

1. **治标**:`checkResultQuality()` 不认识乱码模式,对所有失败提示"换参数重试",Agent 反复重试直至耗尽 maxIterations,用户看到"达到思考上限"
2. **治本**:mammoth 库在 `zipfile.js` 中硬编码 `TextDecoder("utf-8")` 解码 docx 内的 XML,当文档由国产软件(旧版 WPS 等)生成且 XML 实际编码为 GBK 时,直接产生乱码——这个乱码一路流经 DeepSeek 解析、SQLite 存储、Agent 工具读取,全程无人察觉

两个问题都要解决:治标防止灾难体验,治本消除乱码源头。

## What Changes

- 新增 `isGarbledText()` 工具函数,检测 mojibake 特征
- 扩展 `checkResultQuality()` 返回类型,新增 `"garbled"` 状态
- **智能降级策略**(非盲目放弃):garbled → 尝试 Qwen-Long 重新提取 → 再失败 → 引导用户交互
- **docx 导入路径增加编码容错**:mammoth 提取后检测乱码,自动 fallback 到 Qwen-Long AI 提取(与 .doc/.pdf 统一)
- 在 `get_reference_detail` 工具中添加内容可读性校验

## Capabilities

### New Capabilities

- `text-garbled-detection`: 文本乱码检测——检测 U+FFFD 替换字符密度、C1 控制字符污染、中文拉丁乱码模式,判定文本是否因编码错误不可读

### Modified Capabilities

- `agent-loop-engine`: Quality Gate 结果质量类型扩展,新增 `"garbled"` 状态及智能降级策略
- `agent-loop-client`: 同上,客户端 Loop 的 quality 系统和 garbled 处理策略
- `reference-resume-library`: docx 导入流程增加 mammoth 乱码检测 → Qwen-Long fallback

## Impact

- `src/lib/agent/loop/text-quality.ts` (NEW) — 乱码检测函数
- `src/lib/agent/loop/client-runner.ts` (修改) — quality 系统 + 智能降级
- `src/lib/agent/loop/server-runner.ts` (修改) — 同上
- `src/lib/agent/loop/types.ts` (修改) — ResultQuality 类型
- `src/app/api/cv/import-reference/route.ts` (修改) — docx mammoth → Qwen-Long fallback
- `src/lib/agent/tools/query/get-reference-detail.ts` (修改) — 内容可读性校验
