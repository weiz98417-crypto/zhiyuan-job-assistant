# 语音面试技术选型备案(2026-10 调研,A3 观察项)

状态:**不动工**。触发条件(UPGRADE-PLAN-2026-10B 登记):面试教练月活达标后评估。本文是 2026-10-05 联网调研的结论沉淀,触发即用,避免重新调研。

## 关键结论:TS 疑虑已解除

2026-10-04 交接时的顾虑「pipecat/livekit/TEN 均 Python 为主,TS 生态要重评估」**已过时**:LiveKit 官方 TS 框架 **agents-js 已到 1.x**(Apache-2.0),官方文档支持 `with_deepseek()`,内置 Silero VAD 与多语言语义轮次检测。TS-only 团队不需要为语音引入 Python。残余差距:插件数 37 vs Python 版 72、MCP 工具仅 Python——不构成阻塞。

## DeepSeek 约束与自组管道

DeepSeek 无语音 API,链路必须自组:流式 ASR → DeepSeek → 流式 TTS。端到端 1.5-2.5s 可达,面试场景 ~2s 可接受;S2S 一体模型(OpenAI Realtime $32-64/1M audio tokens、Gemini Live)延迟上限更高但替换掉 DeepSeek 且大陆不可直连,排除。

## 三条原型栈(成本升序,触发后按此启动)

1. **纯浏览器**(¥0,1-2 天):Web Speech API(zh-CN)+ edge-tts。限 Chrome/Edge、大陆访问 Google ASR 不稳、无真打断(按钮打断)——只验证交互形态。
2. **国内云自组**(≈¥1-3/场,一周):`getUserMedia`+AudioWorklet 抽 16k PCM → WebSocket → 阿里/火山流式 ASR(≈2.5-3.5 元/小时)→ DeepSeek 流式 → 火山豆包 TTS(约 ¥5-20/万字符)或 MiniMax;前端 silero-vad(onnx)做打断。**大陆用户的正确原型路。注意:不用 MediaRecorder(webm 分片不齐,流式 ASR 要裸 PCM)。**
3. **LiveKit Cloud 免费档 + agents-js**(一周):框架能力最全(内置 VAD/轮次/打断),适合海外用户;大陆连美国节点延迟差。

## 产品期(国内)

阿里/腾讯云部署:agents-js 自托管(LiveKit server Apache-2.0 可自部署)+ FunASR Paraformer 自部署(框架 MIT,中文准确率显著优于 whisper:CER<10% vs ~23%,CPU 可低并发)+ DeepSeek + 火山豆包 TTS(量大换 CosyVoice2,Apache-2.0,流式首包 ~150ms)。录音需告知,符合个保法。WebRTC/SFU 只在要抗弱网、多人、电话混线时才上。

## 许可证/合规红灯

- **TEN framework**:Apache-2.0 附带条件(禁端侧部署、禁与 Agora 竞争性使用),0.x。
- **ChatTTS**:权重 CC BY-NC 4.0 非商用 + 故意降质 + 停滞。
- **edge-tts**:逆向 Edge 非官方接口,无 SLA 随时封——仅 demo。
- 托管型(Vapi $0.10-0.33/min、Retell $0.07-0.31/min、Bland 无 BYOK):都能接 DeepSeek(Bland 除外),但数据出境+跨境链路,大陆产品期不可用;原型期如需快速验证可临时用。
- whisper 系:中文短板(幻觉重),纯中文场景不选。

## 触发后的第一步

用原型栈 2 起一周原型,接现有面试教练的题库与评分锚点(Spec 26/27 既有资产),验证「语音形态是否提升面试练习完成率」——这是月活触发条件想回答的问题本身。
