# Spec 38: Resume Visual Review Loop(简历视觉反测回路,A2)

Target label: `ready-for-agent`
Depends on: Spec 37(单一渲染出口)、`src/lib/server/cv-pdf-html.ts` 渲染接缝(Spec 24 埋的;注意**并非严格纯函数**,见下);批次 0.22.0;10 人用户回访(`docs/user-callback-script-2026-10.md`)**并行进行,不阻塞回路建设**(grilling Q7)

## Problem

CEO 判断:中国求职的真实闸门是 Boss 直聘在线简历 + HR 三秒扫视,模板丑可能比数字编造更杀回复率。当前改模板全靠开发者自己看着行——「好不好看」没有机器门禁。UPGRADE-PLAN-2026-10B 曾把它登记为 NOT-in-scope(触发:10 用户回访);grilling Q7 定为回路先行:GLM-4.6V-Flash 免费档/qwen3-vl-flash(¥0.15/百万 tokens)的出现把验证成本降到趋零,回路建设与回访并行不再串行等待。

## Solution

**开发侧门禁脚本**(不做用户可见功能):`scripts/verify-resume-visual.mjs`

1. 渲染:用 `cv-pdf-html.ts`(157 行,导出 normalizeTextForATS/getTemplateCSS/buildCvHtml/stripHtmlTags)对 3-5 份固定样本简历(不同密度/长度/岗位族)产 HTML → Playwright 截图(先例:`verify-desktop-layout.mjs`、`scripts/verify-dual-canvas.mjs:15`);截图落仓库内 `.gitignore` 目录。注:该文件并非严格纯函数(getTemplateCSS 内 `fs.readFileSync` :107-108 读模板 CSS)——本 spec 不要求改造;若截图断言需要,可把 CSS 读盘提为模块初始化一次性加载(顺手纯化,半天内)。
2. 评审:调 **DeepSeek 视觉**(deepseek-v4.1-flash,grilling Q8:只接这一家,不做 provider 抽象),输出**结构化四维批评**:排版层级/密度/对齐/颜色,每维 0-10 分 + 具体问题描述(含问题区域描述);JSON 走 llm-json.ts 收口入口。
3. 门禁:任一维 < 阈值(初始 6,校准后定)或总分 < 阈值 → exit 1 并打印批评全文;模板 diff 的 PR 必跑。
4. 基线冻结:首次运行把各样本各维分数存 `scripts/.visual-review-baseline.json`(哈希比对手法沿用 knowledge-drift 的归一化教训:BOM/CRLF 归一后再哈希);后续模板改动对比基线,显著劣化即红。

## User Stories

- 我改了简历模板 CSS:跑一条命令,30 秒内知道「哪一维变差了、差在哪」,不用自己开五份简历肉眼扫。
- (0.22 后,回访验证需求为真时)再立项模板美化——本 spec 只建尺子,不动模板。

## Implementation Decisions

- VLM prompt 要求输出 JSON(四维分数+描述),温度低、maxTokens 给足;失败重试 1 次,仍失败 exit 2(与门禁红区分,网络/服务问题不应掩盖真实观感问题)。
- 成本护栏:样本数量固定(3-5),单图 1-2k tokens,单次全跑约 ¥0.01-0.1 量级;不并发轰 API。
- 不引入 zod/instructor-js;评审 prompt 是 prompt 资产,归 knowledge registry 管理(沿用 modes/registry 既有挂载纪律)。
- 脚本只在本地/CI 手动触发,不进 capability-evals 必跑集(视觉分数有概率性,先攒校准数据;阈值统计化语义沿用「未评分≤10%、单点波动≤1 例」经验)。

## Testing Decisions

- 结构化输出解析测试(mock DeepSeek 响应:合法 JSON/截断/四维缺一)。
- 基线比对逻辑纯函数测试(分数变化→红/绿判定)。
- 真实调用冒烟:本地有 key 跑一次全样本,人工过目批评质量并记录到 `docs/` 校准笔记。

## Out of Scope

- 模板美化与重排(等回路绿+回访反馈,Q7c);用户可见功能;多 VLM provider 抽象(Q8);PDF 分页增强。

## Further Notes

- 预估 1-2 天。回访提纲(10 题)已备:`docs/user-callback-script-2026-10.md`。
- 许可证红线持续有效:OpenResume/Vivliostyle(AGPL)、OrangeX4(无证)、NorthSecond(NC)——美化立项时只可借鉴 Reactive Resume(MIT)与 LapisCV(MIT)版式。
- 若 DeepSeek 视觉对中文简历截图的批评质量差(冒烟发现),升级路径:注册智谱换 GLM-4.6V-Flash(免费)——届时是第二个真实 adapter,再抽接缝。

## 实施记录(2026-10-06,0.22.0)

- 全链路真实冒烟通过(三样本出结构化批评,质量高——每条带具体位置)。门禁**交付时即为红**(10 条):模板未达 HR 三秒线,Q7c 约定美化另立车,尺子保持红;基线已冻结首跑分数作 before 档案。校准记录:`docs/visual-review-calibration-2026-10-06.md`。
- **首跑抓出两个渲染缺陷,当日修复**(内容正确性 bug,非美化):恒空板块(Certifications/Languages & Tools)整块删除(此前只渲标题);联系方式行空字段悬空 `|` 剔除。改的是 cv-pdf-html.ts,PDF 外观有变——是缺陷修复,记录在案。
- **评审修订(实 Quality gate 语义)**:基线「冻结」初版实现是滚动覆盖(红了也写+换模板跳过比对=「显著劣化即红」永不触发)——已改为**红不落基线 + 有基线即比(无论内容变否)**;网络/HTTP 错误也重试一次(与解析失败同)。模型 `deepseek-flash` vision 实测可用(spec Q8 型号名 deepseek-v4.1-flash 为调研名,以实测可用为准,env 可切)。
- prompt 资产:`prompt.resume-visual-review`(manifest 14 条);样本夹具 `scripts/visual-review-fixtures.mjs`(三密度);纯函数核心 `scripts/visual-review-core.mjs` + 6 单测。
