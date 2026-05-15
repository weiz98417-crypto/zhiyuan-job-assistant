## Context

当前 Agent Loop 中的 `checkResultQuality()` 只区分 `good`/`empty`/`irrelevant` 三态。当文件读取工具返回编码错误导致的乱码文本(mojibake)时,该函数无法识别,将其归类为 `empty` 或 `good`,导致后续 qualityHint 指令 LLM "换参数重试"。这是无效的——编码问题不是参数调整能解决的。

更根本的问题在 mammoth 层:docx 是 ZIP 包,mammoth 在 `node_modules/mammoth/lib/zipfile.js:19` 硬编码 `TextDecoder("utf-8")` 解码 ZIP 内的 XML 文件。当文档由国产软件(旧版 WPS 等)生成,XML 实际编码为 GBK 时,U+FFFD 替换字符在 mammoth 提取阶段就已产生。这个乱码一路流经 DeepSeek 解析 → SQLite 存储 → Agent 工具读取,全程无人察觉。

当前系统链路:
- docx → mammoth(`TextDecoder("utf-8")`) → rawText → DeepSeek 解析 → SQLite `reference_resumes` 表
- 查询 → `get_reference_detail` 工具 → `formatResult()` 展示内容 → 传入 LLM 上下文 → Agent 判断内容不可读 → 重试 → 循环

## Goals / Non-Goals

**Goals:**
- 识别编码异常导致的乱码文本,避免将其传入 LLM 上下文
- 智能降级:garbled 后尝试 Qwen-Long fallback,再失败才引导用户交互
- docx 导入路径治本:mammoth 提取后检测乱码 → 自动 fallback 到 Qwen-Long
- Agent Loop 中 garbled 结果不触发无效重试循环

**Non-Goals:**
- 不引入 iconv-lite/jschardet 等编码探测库(不修改 mammoth 内部)
- 不改变 maxIterations 默认值
- 不修改 UI 层
- 不处理已入库的历史乱码数据(仅阻止新乱码入库)

## Decisions

### Decision 1: 文本级乱码检测(非二进制编码探测)

选择在**已提取的文本内容**上做 mojibake 检测,而非在二进制文件读取阶段做编码探测。理由:
- mammoth 已经做了从 docx ZIP 到文本的转换,我们拿到的就是文本
- 文本级检测同时覆盖 docx 提取失败、PDF 提取失败、纯文本导入编码错误等所有场景
- 不需要引入 `jschardet`/`iconv-lite` 等新依赖
- Agent Loop 中的工具执行时不持有原始二进制文件

### Decision 2: 乱码检测阈值策略

使用三项检测的**组合**,任一命中即判定为 garbled:

1. **U+FFFD 密度** ≥ 0.5%(即每 200 个字符中出现 1 个 � 替换字符)
2. **C1 控制字符密度** ≥ 1%(0x80-0x9F 范围) — docx/PDF 提取中典型的编码污染
3. **中文文本拉丁乱码**:文本长度 > 100,中文字符(CJK)占比 < 5%,且拉丁扩展区占比 > 30%

Note: 是"任一命中"而非"全部命中"——因为不同的编码错误产生不同的乱码模式,U+FFFD 本身已是明确信号。

### Decision 3: 智能降级路径(非盲目放弃)

```
工具返回结果 → checkResultQuality()
  → "garbled"
    → 判断工具类型:
      ├─ get_reference_detail (数据库读取)
      │   → 立即告知用户内容编码异常,引导粘贴文本
      │   (数据库中已是乱码,重试无意义)
      │
      ├─ import_reference / docx 导入
      │   → mammoth 输出乱码?
      │   → 自动 fallback 到 Qwen-Long AI 提取(像 .doc/.pdf 一样)
      │   → Qwen-Long 也失败?
      │   → 告知用户: "文档编码不兼容,请尝试:1)粘贴文本 2)另存为 UTF-8 txt"
      │
      └─ 搜索类工具(web_search 等)
          → 不触发 "garbled"(搜索返回的事 serpAPI 文本,不会有编码问题)
```

核心原则:**同参数重试 = 浪费,不同方法重试 = 有价值,用户交互 = 最终兜底**。

### Decision 4: docx 导入路径治本——mammoth → Qwen-Long fallback

在 `import-reference/route.ts` 中,mammoth 提取 docx 后:
1. 用 `isGarbledText()` 检测 rawText
2. 若未乱码 → 正常走 DeepSeek 解析
3. 若乱码 → 不经过 DeepSeek,直接用 `extractViaQwenLong(buffer, filename)` 重新提取(像 .doc/.pdf 一样)
4. Qwen-Long 返回的文本 → 走 DeepSeek 解析 → 正常写入数据库

这样乱码数据根本不会入库。

### Decision 5: Agent Loop 中 garbled 的处理

quality === "garbled" 时:
- 不增加 `autoRetryCount`(这不是搜索失败)
- 增加 `state.consecutiveFailures`(这是真实的工具失败)
- 但触发条件与 autoRetry 不同:
  - 如果是文件读取类工具(name 含 `get_reference`、`Read`):直接进入 responding,告知用户
  - 其他工具:仍允许 1 次 fallback 尝试(换工具/换方法)

### Decision 6: 工具名称感知

文件读取类工具的 garbled 标记为 `recoverable: false`:
- `get_reference_detail`:数据库中数据已是乱码,重试不会变
- `Read`(Claude Code 自带):文件编码问题,重试不会变
- 搜索类工具(`web_search`):正常情况不会触发 garbled

## Risks / Trade-offs

- **Qwen-Long fallback 增加延迟**:mammoth 秒级 → Qwen-Long 需 30-60s → 但只在 mammoth 产生乱码时触发,正常 docx 不受影响
- **误判风险**:非常规但合法的文本可能被误判 → U+FFFD 和 C1 控制字符在正常文本中几乎不存在,误判概率极低
- **历史数据**:已入库的乱码参考简历不会被自动修复 → 用户需手动删除并重新导入。可后续加"重新解析"按钮

## Migration Plan

1. 部署新代码(向后兼容,无 schema 变更)
2. 已入库的乱码数据:用户重新上传 docx 时自动走 Qwen-Long 路径修正
3. 无需回滚计划(纯逻辑改动,无数据迁移)
