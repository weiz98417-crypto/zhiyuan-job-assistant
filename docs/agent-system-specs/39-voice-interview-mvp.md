# Spec 39: Voice Interview MVP(语音面试 MVP,A3 转正)

Target label: `ready-for-agent`
Depends on: Spec 27(面试题库 composeInterview)、Spec 26(评分锚定复盘)、Spec 25(注册表,prompt 资产挂载)、Spec 32(llm-json 收口入口);批次 **0.23.0**;供应商:小米 MiMo API(key 已验证)

## Problem

语音面试在 2026-10B 登记为 NOT-in-scope(触发:面试教练月活)。2026-10-06 用户推翻该决策转正:面试练习的语音形态是提升完成率的关键假设,且小米 MiMo 语音 API(TTS 限时免费/ASR ¥0.5/小时)让成本不再是门槛。原技术疑虑「TS 生态要重评估」已解除(选型记录:`docs/voice-interview-options-2026-10.md`)。

## Solution

**MiMo 做嗓子与耳朵,DeepSeek 保持教练脑,回合制 MVP**(grilling 2026-10-06 定稿):

```
按住说话 → 录音停止 → wav → MiMo ASR 整段转写(同一把 key)
        → 文字上屏 + DeepSeek 流式(教练:主问题/composeInterview 选题主问题 + decideFollowUp 追问)
        → 按句切分 → MiMo TTS SSE(voice=白桦)逐句合成 → 前端顺序播放,播放中可点停
        → 全程 transcript 持久化进面试会话 → 结束走既有 rubric 评分复盘(无语音评分)
```

决策落位:ASR 两步走(本期 MiMo ASR 整段转写=回合制交互,零新增供应商;流式 ASR 是产品期升级)、打断=交互式点停(自动 barge-in 随流式 ASR 一起做)、音色默认**白桦**(环境变量可换)。

## User Stories

- 用户在面试教练中开启语音模式:听到面试官(白桦)朗读主问题,按住说话回答,松开后文字上屏并得到追问语音;整场结束照常出评分卡复盘。
- 用户在播放中点「停止」:立刻静音并进入作答态,不用等读完。

## Implementation Decisions

**供应商事实(2026-10-06 真实 key 冒烟验证,三项全过)**:

- 端点:`POST https://api.xiaomimimo.com/v1/chat/completions`(OpenAI 兼容),鉴权 `Authorization: Bearer $MIMO_API_KEY`。
- TTS:`model:"mimo-v2.5-tts"`,目标文本放 `messages[0].content`(role=assistant),音色 `audio.voice`(默认 `mimo_default`,白桦/冰糖/茉莉/苏打/中文可用),`audio.format` wav/mp3/pcm;`stream:true` 时 SSE 分片在 `choices[].delta.audio.data`(base64);非流式在 `choices[].message.audio.data`。
- ASR:`model:"mimo-v2.5-asr"`,音频走 `content:[{type:"input_audio",input_audio:{data:"data:audio/wav;base64,…",format:"wav"}}]`,`asr_options.language:"zh"`;转写文本在 `choices[0].message.content`,计费按 `usage.seconds`。整段上传、无麦克风流式(闭环实测:7 秒白桦合成语音逐字转回)。
- 环境变量(已入本地 `.env`,gitignore :104 覆盖):`MIMO_API_KEY`/`MIMO_BASE_URL`/`MIMO_TTS_MODEL`/`MIMO_TTS_VOICE=白桦`/`MIMO_ASR_MODEL`。

**实现规则**:

1. 服务端新路由:`/api/interview/voice/tts`(POST 文本→SSE 音频流透传)与 `/api/interview/voice/asr`(POST base64→转写文本);key 只在服务端,前端永不接触。
2. TTS 按句切分合成+**同文本 LRU 缓存**(服务器内存即可):省免费额度、重播不重算;合成请求 maxTokens 给足,JSON/文本解析一律走 llm-json.ts 入口。
3. 前端录音:`getUserMedia`+MediaRecorder(webm)→ 服务端转 wav(或浏览器直接导 wav;实现时二选一,以 ASR 实测兼容为准)→ base64;录音时长上限单次 120s。
4. 回合状态机沿用既有面试引擎(主问题/追问/硬上限每题≤2 次+reverse 豁免),语音只是 IO 层,不改教练逻辑;transcript 写入会话持久化(投影白名单如需新字段,按三处同步纪律扩)。
5. UTF-8 教训:Windows curl 命令行直接 `-d` 中文会坏(实测 Invalid JSON),Node fetch/JSON body 无此问题——实现与冒烟脚本一律走 Node。

## Testing Decisions

- 路由契约测试(mock fetch):TTS 路由的 SSE 透传与错误降级(MiMo 不可用→明确错误事件不静默)、ASR 路由的载荷构造(base64/format/language)与转写提取。
- 按句切分与缓存:纯函数测试(切句规则、LRU 命中)。
- 真实冒烟脚本 `scripts/smoke-voice-mimo.mjs`(无 key 跳过,沿用 eval 测试 `skipIf(!live)` 模式):合成→回灌→转写相似断言。**冒烟内容已于 2026-10-06 人工跑通三项**(TTS 白桦 wav、ASR 回灌逐字、SSE 流式),脚本固化是本 spec 的交付物之一(当前仓库中尚无此脚本,勿当作已存在)。
- 全量测试零回归;语音模式关闭时(无 key)UI 完全不出现语音入口(功能门禁按 env 探测)。

## Out of Scope

- 麦克风流式 ASR 与自动打断(silero-vad)——产品期升级,另立变更;
- 电话外呼、边说边评、语音评分、音色克隆(voicedesign/voiceclone 模型);
- MiMo-Audio-7B 自部署(24GB GPU、无流式、无教练脑位置,选型已排除);
- 多说话人/多人面试。

## Further Notes

- **免费期风险**:TTS 官方标注限时免费、截止日未知。护栏:按句缓存+单场合成字符预算+余额错误显式降级为纯文字模式(语音不可用≠面试不可用)。
- 延迟预期:回合制下 ASR 整段(秒级)+DeepSeek 首 token+TTS 首包,整体「松开手到听到反馈」2-4s 可接受;流式化后 <1.5s。
- 依赖顺序:spec 32(收口)先行;本 spec 与 0.22 无依赖,0.23.0 排在 0.22 后按现定车序执行,如需提前可与 0.22 换序(用户决定)。
- 音色清单(中文):白桦(男,默认)/冰糖(女)/茉莉(女)/苏打(男);换音色改 `MIMO_TTS_VOICE`,不改代码。
