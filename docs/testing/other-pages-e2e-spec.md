# 其他页面 E2E 完整验收规范

日期：2026-10-12（Asia/Shanghai）。盘点源码基线：`01e46a6d35fea51aaeddcc84f7860c56606c04de`。`VERSION`／`package.json` 当前记录 `0.13.2`，正式执行必须重新核验实际 SHA、工作区差异、构建标识与版本，不能只用版本号证明代码相同。

本文定义完整范围和通过条件。**已授权在38084生产环境实测；逐 `PG-*` ID 的执行状态以 [生产实测报告](production-e2e-report-2026-10-12.md) 及其覆盖审计为准，完整参数矩阵尚未全部完成。** `tests/example.e2e.ts` 的登录元素、空用户名提示、忘记密码跳转 3 项基础用例不能证明登录成功、业务输出或持久化。现有 Vitest、API 测试、确定性评测继续保留，但不替代浏览器 E2E。

统一账号、环境、数据准备、证据脱敏、超时和结果记账遵循 [统一验收标准](./e2e-acceptance-standard.md)。Agent 对话内部行为遵循 [AgentChat 完整规范](./agentchat-e2e-spec.md)。本文覆盖真实页面操作、正确输出、持久化及跨模块交接。

## 1. 验收规则与数据集

### 1.1 每项必须完成的链路

1. 用真实浏览器打开实际路由，经 UI 输入、选择、上传、点击或键盘操作；需要浏览器对话框的流程实际确认或取消。
2. 检查当前屏幕的业务值、材料、对象和状态；“按钮可点”“URL 变化”“HTTP 200”“文件非空”均不单独构成通过。
3. 用新的受认证读取或隔离数据库查询取得独立证据；刷新或重新登录后再次检查。不能把组件 state、刚发出的请求 body 或测试自己生成的假响应当持久化证明。
4. 变更型测试记录操作前后的行数、主键、用户归属、内容及关联。失败、取消、重试不能产生未授权写入、重复记录或假成功。
5. AI 路径分为可重复浏览器流程和 `[LIVE]` 真实产品模型验收。前者可以控制外部网站或模型返回，以检验 UI 和数据链；后者必须实际调用产品模型，保存脱敏输入／输出、工具证据及质量判定。测试操作器的模型不能替产品模型通过质量验收。

证据简称：`UI` 为截图／DOM／焦点／几何读数；`NET` 为脱敏请求、响应及请求次数；`DATA` 为独立受认证读回或隔离数据库；`FILE` 为下载文件解析／渲染；`LIVE` 为真实模型输出及证据。各表最后一列给出必需证据和明确失败条件，通用规则同时适用。

### 1.2 统一 fixture 的页面扩展

账号使用统一标准中的两个互不共享数据的成员、管理员、超级管理员以及 pending／rejected／disabled 账号；文中简称 `A`、`B`、`Admin`、`SuperAdmin`。密码与模型密钥只由运行环境的 credentials／secrets 注入，不写入本文或测试输出。

| 数据集 | 确定内容与用途 |
| --- | --- |
| `PG-F0` | A 为全新用户；服务器各业务表和该浏览器本地数据为空。不得误用生产账号清空获得此状态。 |
| `PG-F1` | 冻结时间为北京时间 `2026-10-12 10:00:00`。16 条 application：8 个 canonical 状态各 2 条；每状态一条日期 `2026-10-12`，另一条 `2026-10-05`，但第二条 evaluated 改为 `2026-10-04`。16 条 application 的 score 均为 4。两条 interview 的更新时间分别为 `2026-10-08` 和 `2026-10-09`。 |
| `PG-F1-R` | 10 份报告 R01–R10，overallScore 依次为 `0、3.49、3.5、3.99、4、4.49、4.5、4.99、5、null`，具有明确公司／岗位／A–G／关键词／来源；`null` 表示未知，不能伪装成确定零分。4 份 Offer；首页预期已评估 10、已投递 8、面试中 2、Offer 4、有效申请平均分 4、本周新增 8。 |
| `PG-F1-I` | 4 场日程日期为 `2026-10-12、10-13、10-19、10-20`，不同公司／岗位／轮次。首页七日面试提醒应包含前三场、排除第四场；面试中超过 3 天未更新应只有 `10-08` 那条；evaluated 超过 7 天未投递应只有 `10-04` 那条。 |
| `PG-F2` | 同公司不同岗位、同岗位不同城市；A／B 各自带唯一标记的 profile、CV、JD、report、application、offer、memory、session、artifact、STAR 故事和练习记录；用于防串绑及隔离。 |
| `PG-F3` | CV 的基础版 V1 与修改版 V2，经历／项目／教育／技能含明确唯一标记；可解析 Markdown、txt、DOCX、文本 PDF、扫描 PDF、PNG／JPG／WEBP及损坏／超大／伪扩展文件。参考简历中的数字与本人履历不同，便于识别抄入事实。 |
| `PG-F4` | 独立扩展 manifest `PG-OFFER-EXT-v1`：O1月薪30K、14薪、奖金20K，年现金440K；O2为32K、12薪、奖金24K，年现金408K；O3薪酬未知；O4含明确福利和地点。这不替换统一标准的`OFFER-A1-v1`／`OFFER-A2-v1`及270K／264K oracle；每条用例写明其实际 seed profile，保留K／元／月／年单位。 |
| `PG-F5` | 受控招聘网站和新闻站提供成功、空结果、重复岗位、登录墙、验证码、重定向、超时、部分来源失败；由真实页面操作发起请求。真实外站另做有限在线检查。 |
| `PG-F6` | 正常、旧格式、字段缺失、坏 JSON、超长内容、中文／英文／emoji／特殊字符以及超过 500 条列表；使用明确的记录数量和排序 oracle。 |

每个测试独立重置自己的数据集；不能串行依赖其他用例“已经成功”。`PG-F1` 的日期、数量和金额由 fixture 清单规定，不能在运行时照抄产品计算结果作为预期。首页预期依据`src/lib/home-dashboard.ts`的当前聚合口径独立手算：已评估=`max(10份report,2条evaluated)=10`；已投递为applied/responded/interview/offer各2条，共8；面试中2；有4条独立Offer时优先显示4而非application的offer状态2；16条application分数均4，平均4；8条当天记录在最近7日，7/8天前记录均不在本周，故本周8。这三个计数源分别为report、application、offer，不能混用。执行时所有关联都在manifest中声明，report/JD共享不能让seed重复建立application。

### 1.3 必须展开的参数矩阵

| 维度 | 参数／展开要求 |
| --- | --- |
| 状态 | `evaluated、applied、responded、interview、offer、rejected、discarded、skip`；每个状态检查列表、筛选、下一步和读回。 |
| 窗口与主题 | `1920×1080、1280×720、1280×600、390×844、320×568`；关键页增加横屏、125%／200%缩放；light／dark、默认／reduced-motion。 |
| 日历 | 北京时间当天、过去、未来 1／2／7／8 天；更新距今 3／4 天、评估距今 7／8 天；月底、年底；浏览器设上海／洛杉矶时区检查业务日不无故偏移。 |
| HTTP／网络 | 未登录、401、403、404、409、429、500、503、请求超时、断网再恢复、部分 API 失败、重复点击／重试；只在隔离环境控制故障。 |
| 文件 | 每种实际支持格式正常样本；空／损坏／加密／超限／伪 MIME／中文文件名；重复选择同一文件。`.doc` 虽出现在 accept 中，仍须验证服务端实际支持并明确拒绝不支持格式。 |
| AI | 可重复替身仅证明 UI／数据；标 `[LIVE]` 的真实文本／视觉／语音模型分别记账，缺 key／服务未启动记录 blocked 或 skipped，不能记为通过。 |
| 模型语义 | 正确信息、有信息缺口、证据冲突、用户纠正、不相关内容、引导编造、参考材料含不同人物事实；判语义和来源，不判固定文案。 |
| 数据权限 | A／B 同浏览器换号、不同 browser context、两个标签页并发；Admin／SuperAdmin；每类读取／修改／删除／导出均检查用户归属。 |

### 1.4 每项的优先级与执行层级

以下按ID范围覆盖全部170项，例外表优先。`P0`为阻止发布的核心正确性、数据安全、上下文与真写入；`P1`为完整功能、兼容和体验；`P2`为补充美术回归。状态仍全部`planned`，优先级不表示已运行。

| ID范围 | 默认priority | 默认level |
| --- | --- | --- |
| PG-AUTH-001–012 | P0 | BROWSER-MOCK |
| PG-NAV-001–008 | P1 | BROWSER-MOCK |
| PG-HOME-001–009 | P1 | BROWSER-MOCK |
| PG-DISC-001–010 | P1 | BROWSER-MOCK，受控真实网页，不替换Web/Worker/DB |
| PG-JD-001–011 | P1 | BROWSER-MOCK |
| PG-CV-001–018 | P0 | BROWSER-MOCK |
| PG-TRACK-001–010 | P0 | BROWSER-MOCK |
| PG-IV-001–010 | P0 | BROWSER-MOCK |
| PG-OFFER-001–008 | P0 | BROWSER-MOCK |
| PG-PROFILE-001–008 | P1 | BROWSER-MOCK |
| PG-MEM-001–009 | P0 | BROWSER-MOCK |
| PG-SET-001–009 | P0 | BROWSER-MOCK |
| PG-AN-001–008 | P1 | BROWSER-MOCK |
| PG-ADMIN-001–012 | P0 | BROWSER-MOCK |
| PG-VIS-001–007 | P1 | BROWSER-MOCK及人工视觉复核 |
| PG-PERF-001–004 | P1 | BROWSER-MOCK＋浏览器性能/资源采样，候选预算待确认 |
| PG-SEC-001–008 | P0 | BROWSER-MOCK |
| PG-REL-001–005 | P0 | CANARY，只读发布身份/服务验收 |
| PG-JOURNEY-001–004 | P0 | BROWSER-LIVE，机械断言不可省略 |

| 精确ID／参数分支 | priority／level例外及限制 |
| --- | --- |
| 例外：PG-NAV-006、PG-HOME-002、PG-JD-005/008/009/010/011、PG-PROFILE-004/005/008、PG-AN-006 | P0；计数、错误绑定、评分、人工确认、数据分歧和历史滚动问题是发布阻断。 |
| 例外：PG-HOME-007、PG-VIS-001/002 | 美术构图本身P2；遮字、无法操作、dark不可读、reduced-motion失效分支P1，归属/数量错误仍P0。 |
| 例外：PG-CV-007/013/014/017/018、PG-IV-007/010、PG-OFFER-006/007/008、PG-MEM-004/006/008、PG-AN-005/007/008 | 同时需要BROWSER-MOCK与BROWSER-LIVE独立结果；真实OCR/优化/语音/反馈语义不能由替身通过代替。 |
| 例外：PG-DISC-005/009/010 | 正常回归为BROWSER-MOCK；真实外站与真实JD评估另记BROWSER-LIVE供应商/样本/日期，不把受控站点当真实招聘站成功。 |
| 例外：PG-MEM-009 | API-INTEGRATION附加层级：经真实受认证HTTP与DB验证，无UI入口；明确不计入浏览器UI完成数。 |
| 例外：PG-VIS-004 | BROWSER-MOCK＋DEVICE-HARDWARE环境标签，使用真实移动设备或支持的移动引擎；记录设备/引擎/系统。仅viewport模拟不能证明软键盘、权限或原生下载行为；真实设备不自动等于真实AI验证。 |
| 例外：PG-AUTH-008、PG-DISC-004/005、PG-CV-005/007、PG-TRACK-010、PG-ADMIN-008/011、PG-SEC-007/008中的故障/重启参数 | FAULT独立结果，加恢复后的BROWSER-MOCK；仅隔离环境，不能让故障脚本替代UI恢复验收。 |
| 例外：PG-REL-001 | P1，BROWSER-MOCK；版本历史正确性。 |
| 例外：PG-REL-003/004 | P0，隔离环境FAULT＋浏览器恢复；上线后只读烟测另记CANARY。 |
| 例外：PG-REL-005 | REPORT-AUDIT附加层级：检查原始runner/trace账本，不计入浏览器UI完成数。 |

每个参数实例在正式manifest中展开`caseId、variantId、fixtureVersion、priority、level、status、evidencePaths`；同一ID有多层时逐层独立记账。不存在的UI、缺失依赖、尚未定义业务规则分别标记实现缺口、blocked或待确认，不降低预期使其通过。

## 2. 实际路由清单与功能限制

以下 27 个非 Agent 路由全部在覆盖范围内；不存在的入口不作为已实现功能。

| 路由 | 页面验收章节／实际作用 |
| --- | --- |
| `/login` | 认证：登录、注册与找回入口。 |
| `/register` | 认证：注册及待审批状态。 |
| `/forgot-password` | 认证：提交找回申请，由管理员核验处理。 |
| `/change-password` | 认证：普通或强制改密。 |
| `/` | 今日手账。 |
| `/discover` | 岗位发现及扫描历史。 |
| `/evaluate` | JD／报告管理总览；不作为旧独立文本输入评估页。 |
| `/evaluate/jds` | JD 库。 |
| `/evaluate/reports` | 结构化报告与 PDF。 |
| `/evaluate/history` | 评估历史及真实报告跳转。 |
| `/cv` | 简历编辑、版本、参考材料、匹配、优化、PDF。 |
| `/tracker` | 投递八状态及面试轮次。 |
| `/interview` | 准备、历史、复盘看板；真实模拟创建 session 后进入 `/agent`。 |
| `/compare` | Offer 档案、报告与比较。 |
| `/profile` | 求职画像、技能候选、目标、历史。 |
| `/memory` | 私人候选／事实确认、纠正、清除。 |
| `/settings` | 设置、账户、新闻与数据管理。 |
| `/analytics` | 统计、感知数据、健康提示、AI 周报。 |
| `/changelog` | 当前版本与更新历史。 |
| `/explore` | 当前直接重定向 `/agent?tab=explore`；验证接缝，不虚构第二套聊天。 |
| `/admin/users` | 账户审批、权限、重置密码。 |
| `/admin/security-events` | 安全审计。 |
| `/admin/memory` | 团队参考、候选模式及索引治理。 |
| `/admin/insights` | 管理数据洞察。 |
| `/admin/agent-runs` | durable runtime 运行监控及治理。 |
| `/admin/agent-traces` | 调用追踪。 |
| `/admin/agent-reviews` | 复盘、证据与评测候选。 |

当前没有 `/outcomes`。真实薪资、拒信和结果反馈通过实际 Agent／服务器能力测试，见分析及跨页旅程。`PracticePanel`／`QuestionList` 文件存在不等于已挂载：当前 `/interview` 主页面实际使用 Launch、History、Recap、Records。profile 历史“还原”当前只刷新；analytics 拒绝原因当前是固定比例估算。这些均列为待验收限制，不给假通过。

## 3. 认证与账户（12 项）

前置：`PG-F0` 与隔离账号矩阵；首注册测试使用独立空数据库。步骤：实际填写认证表单→提交→检查身份→访问目标页→刷新或换标签。敏感操作只用一次性测试账号。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-AUTH-001 | 访问登录；检查字段、密码显隐、Enter 提交；分别空用户名／空密码。 | 校验对应空字段；显隐不修改值；未登录不进入工作区。 | UI、NET无成功登录；出现可用已登录身份即失败。 |
| PG-AUTH-002 | A 正确凭据登录；从受保护深链接开始；重载。 | `/users/me` 为A；目标上下文按产品约定保留；刷新仍A，无他人信息。 | UI、NET、DATA身份；仅URL跳转、身份错误／深链接丢业务对象即失败。 |
| PG-AUTH-003 | 错误密码、不存在用户、pending／rejected／disabled分别登录。 | 不建立有效会话；状态提示准确；错误密码与不存在用户不泄露存在性。 | cookie／身份读回及HTTP；错误账号能读业务数据即失败。 |
| PG-AUTH-004 | 注册新成员；审批前访问受保护页；Admin批准后登录。 | 新记录仅一条、member／pending；批准后active且可登录；审批前无业务权限。 | DATA用户状态、UI登录；直接active或重复记录即失败。 |
| PG-AUTH-005 | 新空数据库首注册及并发首注册；密码16字符以上。 | 明确唯一首个active superadmin；后续账号按审批规则，不能出现双重首管理员。 | DATA数量／角色、并发请求；权限竞争错误即失败。 |
| PG-AUTH-006 | 用户名4／20边界、过短／过长／数字开头、重名；显示名空白。 | 规范化和错误提示一致；无效输入不写入；有效边界可读回。 | UI、DATA用户名集合；静默注册不合法或错误去重即失败。 |
| PG-AUTH-007 | 成员12／管理员16字符、常见密码、含账号标识、UTF-8 72字节边界。 | 正确执行密码策略；多字节不能按字符数绕过；失败保留表单且不写用户。 | HTTP code／DATA；弱密码获有效身份即失败。 |
| PG-AUTH-008 | 连续错误登录至限流；等待解除；隔离环境Redis不可用。 | 429／Retry-After正确；解除后可正常登录；安全服务异常不绕过限制。 | NET时序、审计；无限尝试或永久锁定即失败。 |
| PG-AUTH-009 | 找回有效／不存在／非active账号；重复提交、超长输入。 | 对外统一接受文案；有效账号产生对应找回申请；限流有效；不虚构已寄邮件。 | DATA申请／安全事件、HTTP；泄露账户存在性或错绑即失败。 |
| PG-AUTH-010 | Admin重置→临时密码登录→强制改密；直接访问其他页尝试绕过。 | 仅改密流程可用；当前密码／新密码确认校验正确；成功后强制标志清除。 | DATA tokenVersion／mustChangePassword、旧token请求；可绕过即失败。 |
| PG-AUTH-011 | 两标签登录A；改密／禁用／角色变更／自然过期；恢复后登录。 | 旧会话按权限版本失效；标签得到明确提示；不能继续执行旧权限。 | NET401／403、DATA；旧token仍能写入即失败。 |
| PG-AUTH-012 | 正常退出；后退／刷新／直链／业务API；断网时退出再恢复。 | 登录身份清除；受保护数据不再可操作；未完成服务器撤销须明确处理。 | cookie／身份读回／UI；退出后仍有有效授权即失败。 |

## 4. 全局导航与探索接缝（8 项）

前置：A、Admin、`PG-F2`会话以及全部路由。步骤：经导航切页→对照目标内容→刷新／后退→检查焦点、滚动与身份。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-NAV-001 | 逐个打开27路由及可达侧栏入口；检查分组和高亮。 | 实际内容和目标路由一致；admin权限受控；无空页／重复外壳。 | 路由覆盖清单、UI、console；有路由未访问或错内容即失败。 |
| PG-NAV-002 | Agent侧栏折叠／展开→刷新→普通页→Agent。 | 偏好持久化；普通页布局正确；快捷入口仍有可读名称。 | localStorage、UI几何；只首屏生效或内容被遮即失败。 |
| PG-NAV-003 | Ctrl／Cmd+K；搜索页面及字符串／数值ID会话；键盘选择。 | 打开准确页面／session，当前A只见A会话；无匹配有明确状态。 | NET会话清单、目标session DATA；遗漏字符串ID／错会话即失败。 |
| PG-NAV-004 | 390px底部tab、菜单、更多、管理员抽屉；开关后导航。 | 手机能到全部授权入口；关闭后焦点／点击恢复；非管理员无管理权限。 | UI焦点／route、HTTP；不可达或背景误点即失败。 |
| PG-NAV-005 | light／dark切换、刷新、跨页、首次打开。 | 主题一致持久化；文本、图表、错误状态可读；不只更换背景。 | UI截图／computed style；主题丢失或不可读即失败。 |
| PG-NAV-006 | Agent长会话→普通长页滚动→返回Agent；反复后退／前进。 | 普通页解除html/body锁能到底；Agent重新独立滚动，不上移输入栏。 | overflow／scrollHeight／scrollTop／输入栏rect；残留锁或外层滚动即失败。 |
| PG-NAV-007 | 多种Dialog／Sheet／Toast；Esc／遮罩／Tab／关闭。 | 焦点约束和返回正确；取消不写数据；提示不被遮挡或跨页重复。 | UI焦点、NET变更次数；关闭仍锁页／偷偷写入即失败。 |
| PG-NAV-008 | `/explore`、尾斜线、无效query、404、深链刷新。 | explore进入`/agent?tab=explore`并实际可探索；错误不绑任意对象或无限重定向。 | route与Agent意图／session DATA；仅跳转但功能错误即失败。 |

## 5. 今日手账（9 项）

前置：分别使用`PG-F0`、`PG-F1`、`PG-F1-R`、`PG-F1-I`；固定业务时间。步骤：首屏→数据读回→操作队列→跨页变更→刷新回到首页。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-HOME-001 | 新A打开首页，逐个点空状态／求职工具入口。 | 无数据不假造统计；引导到真实CV／Agent／发现等目标，可继续下一步。 | UI、DATA全空；虚构已有成果或死入口即失败。 |
| PG-HOME-002 | 载入PG-F1完整数据；读取各指标、阶段节点。 | 已评估10、已投递8、面试中2、Offer4、平均4、本周8；状态各2，不能重复算report。 | DATA独立数量、UI精确数值；任一错误即失败。 |
| PG-HOME-003 | 检查今日／未来面试与过期条目；展开日期矩阵。 | 10-12／13／19包含，10-20排除；今天优先；过去及无效日期不误提醒。 | fixture时间、UI清单ID／顺序；少／多／错日即失败。 |
| PG-HOME-004 | 检查更新3／4天、评估7／8天；点击提醒。 | 仅10-08 interview需跟进、10-04 evaluated需决定；跳转正确状态且真实应用筛选。 | UI、目标列表DATA；边界错或只有query没筛选即失败。 |
| PG-HOME-005 | tracker改状态／删report／删Offer后返回并刷新。 | 指标和队列按新事实更新，消失动作不继续引导已删对象。 | DATA前后差值、UI；stale显示或重复成果即失败。 |
| PG-HOME-006 | 首页三个API慢／单失败／全失败；点击刷新。 | 区分loading、失败、零数据；刷新防重复；恢复显示真实统计。 | NET、UI状态时序；失败当零或假成功即失败。 |
| PG-HOME-007 | 三图资产与机会阶段节点；宽／矮／手机／dark。 | hero、空手账、完成手账按对应状态实际使用；无拉伸截断；阶段数字／行动可读。 | 三资产请求及截图、rect；只用一图／美术遮字／节点错数即失败。 |
| PG-HOME-008 | 新闻初载／强刷／空／失败／外链；无目标公司去设置添加。 | 行业和企业新闻身份、来源、缓存更新正确；设置后对应企业可读，不混A/B。 | NET来源、DATA目标、UI外链；旧公司／假新闻／死外链即失败。 |
| PG-HOME-009 | 跨北京时间午夜／月底／年底、洛杉矶浏览器、reduced-motion。 | 当日及本周归属遵守确定业务日；动效减少后功能不损失。 | 冻结时钟、UI／computed animation；偏一天或停动画停功能即失败。 |

## 6. 岗位发现（10 项）

前置：A、`PG-F5`受控真实网页，运行隔离扫描服务；初始岗位数量已知。步骤：填写筛选→真正启动扫描→观察状态→打开岗位→保存／评估→重新读取。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-DISC-001 | 空关键词及中英逗号关键词、排除词、城市、maxResults边界。 | 空值阻止；请求规范化正确；返回岗位符合正／负／地点／数量约束。 | NET参数、DATA岗位集合；只UI有筛选而结果不符即失败。 |
| PG-DISC-002 | 启动→pending→running→done；检查公司进度和新／总数。 | 每状态有真实任务；完成数量与去重结果一致；结束不继续轮询。 | DATA scan、NET次数／UI；虚假done或进度乱序即失败。 |
| PG-DISC-003 | 双击启动、另一tab启动、返回409；刷新重进。 | 同范围仅一个任务；恢复同scanId及进度；不重跑或重复提醒。 | DATA任务数、NET409／UI；新建重复scan即失败。 |
| PG-DISC-004 | pending／running取消；取消失败、完成同时到达。 | 取消真正终止／不再新增；失败保留真状态；竞争结果明确且历史一致。 | DATA任务／新增行、UI；只改按钮或错误终态即失败。 |
| PG-DISC-005 | 来源超时／验证码／登录墙／部分失败／零岗位。 | 部分成功与失败来源明确；无机会不当失败；外部限制不假造岗位。 | 来源响应、DATA、UI；静默假结果即失败。 |
| PG-DISC-006 | 三个tab、历史翻页、sources链接及空历史。 | 每页记录唯一，total正确；来源状态与实际配置一致，无错页重复。 | DATA排序和分页ID、UI；漏项／重复即失败。 |
| PG-DISC-007 | 跨来源重复岗位、同公司不同role／城市；再次扫描。 | 真重复只保留一机会；不同岗位保留；已评估状态不退回new。 | DATA fingerprint／行数／关联；误去重或状态回退即失败。 |
| PG-DISC-008 | 跳过→刷新→显示已跳过→撤销；PATCH故障。 | dismissed与new真正保存；失败回滚或明确未成功；不只内存消失。 | DATA状态、UI／NET；刷新复活或假Toast即失败。 |
| PG-DISC-009 | 正常抓取JD、失败手工粘贴；49／50字、空正文；原链接。 | 来源与完整正文正确；不足门槛阻止；保存一次且关联原机会；外链准确。 | DATA body／source／jdId、UI；仅保存摘要或错公司即失败。 |
| PG-DISC-010 | 保存／保存并评估→JD库→Agent→报告→tracker；重复点击及评估失败。 | 同jdId贯通company／role／来源；report读回后scan_jobs从evaluating收口evaluated；失败保留可诊断状态，不假evaluated；无重复JD／application。 | DATA关联链/scan状态、Agent规范证据；任一错绑／假评估／状态悬挂即失败。 |

## 7. JD 管理、报告与历史（11 项）

前置：`PG-F1-R`、`PG-F2`、旧格式报告；各来源JD、有／无报告JD。步骤：总览→搜索过滤→详情／编辑→下载或加入tracker→读回关联。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-JD-001 | `/evaluate`总览及开始评估按钮。 | 数量与保存记录一致；新评估走真实Agent入口；不期待不存在独立输入框。 | UI、DATA总数／跳转上下文；错入口或虚构数据即失败。 |
| PG-JD-002 | JD按公司／role／正文／keyword搜索；五来源与有／无report组合。 | 结果ID严格匹配fixture，过滤叠加和清除正确；未知来源可读。 | fixture oracle、UI集合；只数量相近或漏项即失败。 |
| PG-JD-003 | 超长JD详情、原链接、编辑company／role／body／keyword；取消。 | 保存后独立读回精确值；Agent使用新版；取消无写入。 | DATA、NET写次数；刷新丢失或只更新本地即失败。 |
| PG-JD-004 | 删除确认／取消、已删／他人ID、接口失败。 | 删除准确JD且关联策略明确；失败保留；不能删除他人或任意回退至第一条。 | DATA前后ID／关联、HTTP；错删／假成功即失败。 |
| PG-JD-005 | report搜索、四评分档、7／30天、四种排序及清过滤。 | 4.5+为R07/08/09，4+加R05/06，3.5+加R03/04；<3.5为R01/02；null不伪零。 | UI精确ID与fixture日期排序；任一边界错即失败。 |
| PG-JD-006 | 打开报告A–G、合法性、keywords、薪资来源与陈旧标记。 | 内容属于所选报告；0–5量纲正确；方向参考有来源／不确定性，不装实时事实。 | DATA blocks／source、UI Trust卡；错报告或无依据确定性即失败。 |
| PG-JD-007 | 旧string／object blocks、缺字段、坏JSON、异常分数。 | 正确兼容或明确不可读取；不崩溃、不显示NaN／超满分、不吞整份报告。 | console、UI、原DATA；伪造补齐或整页空白即失败。 |
| PG-JD-008 | `?report=`指定／不存在／非法／B报告；JD↔report与history点击。 | 打开准确报告；未知不自动错绑；history的`/evaluate?id=`真正呈现目标产物。 | route、UI报告标记、DATA；仅到列表首页即失败。 |
| PG-JD-009 | 下载所选report PDF，中文、长A–G、表格及分页。 | MIME/PDF解析有效；company／role／A–G全部存在且与报告一致，无裁切或空白末页。 | FILE文本／页图与DATA对比；非空错误HTML／缺板块即失败。 |
| PG-JD-010 | report加入tracker两次，再刷新tracker／首页。 | 一条正确关联application，reportNum／jdId／score一致；数量只加一次。 | DATA唯一键／行数、UI；双记录或错ID即失败。 |
| PG-JD-011 | 删report、加载API失败／恢复；重新看JD库／tracker／history。 | reportId清除、死链接明确；读取失败不以本地缓存伪装正常零结果。 | DATA关联／UI错误与恢复；残留成功／误空状态即失败。 |

## 8. 简历管理（18 项）

前置：`PG-F3`、固定JD／参考材料、服务器与本地相互不同的版本标记。步骤：打开→编辑／上传／优化→明确确认→刷新及新会话读回。PDF必须解析文本并渲染检查；优化 `[LIVE]` 同时执行事实与语义验收。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-CV-001 | 空简历、服务器有V1、本地残留另一版、服务器失败分别打开。 | 当前版来自正确用户权威数据；失败不静默拿旧版替换；空状态可编辑。 | DATA activeVersion／sections、UI；错用户／错版／覆盖即失败。 |
| PG-CV-002 | 当前五个默认栏目summary/experience/projects/education/skills编辑／清空／保存；重载及Agent查询。 | 保存文本精确、只改目标栏；Agent读到已保存版；不能成功提示早于持久化。 | DATA正文diff、NET；刷新丢失或其他栏被改即失败。 |
| PG-CV-003 | 新建、重命名、切换、删除版本、仅剩一版。 | 名称／内容／activeVersion正确；禁止删除最后必要版本或明确建立替代；失败不消失。 | DATA versions、UI；空active或错删即失败。 |
| PG-CV-004 | dirty状态执行切换／新建／删／改名；保存继续／放弃继续／取消。 | 三分支内容与版本动作正确；不丢未保存编辑、不偷偷保存放弃内容。 | DATA前后hash、UI；Dialog存在但执行错误即失败。 |
| PG-CV-005 | V1/V2差异；两个tab／Agent并发更新再保存旧版。 | 差异显示真实增删改；较新版本受冲突保护，不被旧客户端覆盖。 | 独立diff／revision、UI；自动拼接／覆新版即失败。 |
| PG-CV-006 | Markdown、txt、DOCX、文本PDF分别导入，再选择同文件。 | 人名／日期／经历／技能／换行保存完整；重复策略明确，无双击重复版本。 | FILE原文与DATA覆盖率、UI；只解析到部分却宣称完整即失败。 |
| PG-CV-007 | `[LIVE]`扫描PDF、图片OCR；无MinerU／视觉key；坏／加密／空／超限／伪MIME／doc。 | 有能力时保留正确文字与缺失提示；缺依赖明确blocked／错误；不得编造补全。 | FILE、LIVE提取／DATA、HTTP；未调用却宣称识别成功即失败。 |
| PG-CV-008 | 完整性低／未知的导入；确认当前／稍后处理；dirty原版。 | 新待确认版完整保存；原版不静默替换；确认后active精确变化；稍后仍可找回。 | DATA versions／active、UI；待确认仅存内存或原稿丢失即失败。 |
| PG-CV-009 | 经历含项目→预览分栏→撤销／保存；预览后手改再尝试撤销。 | 搬移内容无丢／重复；未保存不改权威版；手改后不覆盖新编辑。 | DATA与原文diff、UI；一键撤销毁手改即失败。 |
| PG-CV-010 | clean／modern／compact、预览↔编辑、超长中文及Markdown链接。 | 全栏目正确版次；文本安全；三模板层次和分栏可读，无溢出／漏栏目。 | UI截图／rect、DATA；仅模板名变或恶意HTML执行即失败。 |
| PG-CV-011 | 每模板下载PDF，目标company、settings个人信息；长内容多页。 | PDF真实可解析；姓名／联系方式／版本全部正文准确；A4分页无截断、重叠、空标题。 | FILE文本＋逐页图与DATA；文件非空但缺内容／错用户即失败。 |
| PG-CV-012 | 选择指定report做JD匹配，空CV、无keywords、模型超时。 | company／role／keywords绑定正确；matchPercent在0–100；本地fallback明确标识。 | NET、DATA、UI；使用另report或fallback假AI即失败。 |
| PG-CV-013 | `[LIVE]`full／star／quantify／keywords × effort1–5；角色方向／JD／意图。 | 改写符合操作强度和JD；事实不变；不移植参考学历／数字／经历；缺量化证据请求补足。 | LIVE原稿／输出事实diff及规则；仅返回候选但编造即失败。 |
| PG-CV-014 | effort1–3与4–5追问开关；回答选择／自定义／缺项后生成。 | 低effort不可启用；高effort追问答案真正进入生成；不反复问已答或忽略纠正。 | NET问题／answers、LIVE输出；只有UI勾选但无上下文即失败。 |
| PG-CV-015 | 定向／通用候选接受其一、不接受／关闭、重新生成。 | 接受只修改目标栏目；未接受不写当前版；最终保存／PDF只含已确认结果。 | DATA版本diff、FILE、UI；草稿未经确认落盘即失败。 |
| PG-CV-016 | 参考简历文件／文本导入，角色类别空／有效，私人与团队范围。 | 分类必填；private仅本人；team先pending；原材料与索引可读；改名／删除真实保存。 | DATA分类／scope／状态、A/B读取；跨用户泄露即失败。 |
| PG-CV-017 | 参考pending→批准／拒绝→停用／恢复／删除／reindex；选择参考优化。 | 仅允许状态参与检索；检索角色适配；可学习结构，不能复制参考用户事实。 | DATA状态、检索ID、LIVE输出；停用仍用或抄数据即失败。 |
| PG-CV-018 | 事实审查／视觉审查产物与Trust卡；同CV不同版本。 | 来源、问题、截图、建议绑定正确版；不确定性可见；无页面入口则从真实Agent产物验收。 | 产物DATA、截图FILE、LIVE；错版或“看起来好”替事实验收即失败。 |

## 9. 投递追踪（10 项）

前置：`PG-F1`、同公司不同岗位；重载前后独立读回。步骤：列表／看板操作→服务端确认→详情→刷新→首页及面试看板。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-TRACK-001 | 8状态在列表／分组／看板切换。 | 每状态2条、总16；同主键不重复；标签与状态对应。 | DATA、UI每组ID；少项／错状态即失败。 |
| PG-TRACK-002 | company／role搜索、status、日期／score／company升降序、URL`?status=`。 | 筛选与排序oracle一致，URL真正应用；清除恢复16条。 | UI ID顺序、DATA；query存在但忽略即失败。 |
| PG-TRACK-003 | 下拉／下一步／拖拽执行评估→投递→回复→面试→Offer。 | 三入口状态一致、每步服务端保存、动作正确；标投递是记录，不假称外部网站已发送。 | DATA状态历程／NET、UI；仅前端改状态即失败。 |
| PG-TRACK-004 | skip／discarded／rejected／重新评估；拖到同状态、无效拖数据。 | 合法状态操作真实保存；无效不写；动作对应阶段。 | DATA、NET写次数；错状态或崩溃即失败。 |
| PG-TRACK-005 | 首次面试弹窗：取消、轮次1／日期／备注保存；第二轮追加。 | 取消不提前interview；轮次／日期／备注刷新仍完整，无覆盖；日程供首页／interview读取。 | DATA轮次／notes、重载UI；仅state拼轮次即失败。 |
| PG-TRACK-006 | 创建跟进、记录HR回复；重复提交／网络失败。 | note／时间／来源与对象准确；失败不Toast成功，重试不重复备注。 | DATA笔数／内容、UI；假跟进或重复追加即失败。 |
| PG-TRACK-007 | 详情Sheet与report链接、面试历史、长备注。 | 关联精确；无report明确；关闭保留列表筛选和焦点。 | DATA关联、UI；同公司另role报告即失败。 |
| PG-TRACK-008 | 选中导出、当前筛选导出；取消选择、筛选后选中。 | Markdown解析条数／公司／role／状态精确，仅所选或筛选集合。 | FILE解析与DATA集合；非空但漏项／额外项即失败。 |
| PG-TRACK-009 | 首次进入Offer庆祝；取消再进、reduced-motion；谈薪／HR按钮。 | 庆祝不改变其他业务；新Agent绑定application／report／company／role及intent正确。 | DATA状态及session、UI；庆祝触发重复写或错绑即失败。 |
| PG-TRACK-010 | 两tab同时变更、404／500／超时；刷新及大列表小屏。 | 权威状态可恢复，不丢较新变更；错误明确；所有操作在小屏可达。 | DATA revision、UI／NET；假成功、整页无法继续即失败。 |

## 10. 面试看板与模拟入口（10 项）

前置：有／无CV、多个JD、面试session、旧练习及STAR故事；当前挂载组件清单按实际页面核对。步骤：准备→创建session→在Agent完成练习（对应Agent规范）→回看／复盘／刷新。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-IV-001 | 空看板、开始练习／去Agent入口、准备／历史／复盘分区。 | 空态不假造评分；真实入口可继续；不为未挂载组件虚构按钮。 | UI、DATA空集合；只看组件文件即称已测失败。 |
| PG-IV-002 | 多JD选择、字符串／数值ID、删除所选、刷新素材。 | 选中准确company／role／正文；有效选择不被focus刷新重置；缺失有明确fallback。 | DATA JD及UI selection；选第二条仍用第一条即失败。 |
| PG-IV-003 | 有V2／空CV／server失败／本地旧CV。 | 展示绑定服务器当前版；材料不完整须明确；不能悄悄用旧版或任意JD。 | DATA activeVersion／snapshot、UI；错误材料开始模拟即失败。 |
| PG-IV-004 | realistic／pressure／focused × normal／hard／pressure；focusAreas、followUps。 | createSession中的plan精确对应选择；标题、JD／CV快照持久化，刷新Agent不丢。 | DATA session interviewState、NET；只URL正确但计划缺失即失败。 |
| PG-IV-005 | 双击开始、创建失败、刷新／后退重试。 | 创建成功仅一session；失败保留表单；无未绑定普通会话假启动。 | DATA session数量、UI；重复或空计划即失败。 |
| PG-IV-006 | 完成或暂停模拟→历史搜索／展开／打开；删记录取消／确认。 | 只列真实面试session，转录／score归属正确；删除Agent历史同步。 | DATA与UI会话ID；误列闲聊、假分数或删错即失败。 |
| PG-IV-007 | 复盘rubric、弱点、改进建议、答案引用、sourceTurnId。 | 0–5量纲与证据一致；引用命中真实答案；未知来源不随便绑定第一条。 | DATA转录／score、LIVE校准；高分无证据／错引用即失败。 |
| PG-IV-008 | 练习／手工故事筛选搜索、转STAR、编辑／删除／取消。 | S/T/A/R／reflection／tags内容精确保存；标题必填；本地记录换号隔离。 | 独立IndexedDB与UI重载、A/B；只有state或跨号泄露即失败。 |
| PG-IV-009 | 有分／无分／5分边界、分类不足2样本、趋势；tracker日程。 | 均值不把无分算零；弱项按样本条件；未来日程轮次排序正确。 | fixture手算与DATA／UI；NaN、虚构弱点或偏日即失败。 |
| PG-IV-010 | 从本页启动后在Agent `[LIVE]` 录音、ASR、回复播报／停止、文字备用。 | 全语音流程保留JD／CV计划；权限拒绝可文字作答；停止不删转录／跳题。 | LIVE音频转录／session、UI；语音能播但上下文丢失即失败。 |

## 11. Offer 档案与对比（8 项）

前置：`PG-F4`、有档案无报告／有报告无档案／旧报告、同公司不同role。步骤：录入→编辑读回→选择对比→评估或谈判→返回查档案。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-OFFER-001 | O1／O2录入、编辑／取消，company／role空及数值边界。 | 保存字段精确；O1年现金440K、O2为408K；取消不写；负值／NaN／单位不混。 | DATA、UI金额手算；年薪错或弱校验落坏值即失败。 |
| PG-OFFER-002 | 0／1／2／3／4／5选中；进出对比、取消选择。 | 至少2才比较，最多4；列与选择ID一致；第五不可加入。 | UI集合与DATA；只按钮可点或比较错档案即失败。 |
| PG-OFFER-003 | 比较O1–O4，未知薪酬、福利、地点、风险。 | 展示现金、薪资结构、福利和缺失项；未知不伪确定0；不将估算当保证。 | DATA原条件、UI／LIVE；无来源确定建议即失败。 |
| PG-OFFER-004 | 有report无offer的synthetic条目；多report选择；修改offer。 | 条目与最新报告准确关联；修改后旧报告stale可见，新评估后同步。 | DATA关联／输入hash、UI；负ID错删或旧report假最新即失败。 |
| PG-OFFER-005 | 删除offer／report，取消／确认／失败，删除已选对比条目。 | 精确删目标；其他报告按策略保留；无幽灵列、失败不消失。 | DATA行数及ID、UI；只乐观隐藏即失败。 |
| PG-OFFER-006 | 评估／解释／谈薪／HR问题四动作，重复点击。 | 新session唯一、offerId／offerReportId／intent准确，Agent实际使用对应材料。 | DATA session／上下文、LIVE；只带query但忽略即失败。 |
| PG-OFFER-007 | `[LIVE]`读report风险、薪资来源／假设、谈判策略及缺信息追问。 | 计算可信、缺条件保留、建议有证据；不编造外部实时基准或替用户接受offer。 | LIVE结果与DATA／金额oracle；泛文案或越权即失败。 |
| PG-OFFER-008 | tracker Offer动作→档案／Agent；用户修正或记录实际薪资。 | company／role／application对应；新事实有来源；旧假设失效且其他用户不受污染。 | DATA关联和来源、A/B检索；同公司错岗位或跨号变化即失败。 |

## 12. 求职画像（8 项）

前置：空／完整画像、auto与manual技能、候选signal、历史记录。步骤：读取→手工编辑或候选处理→刷新→Agent读取或更新→再次核对。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-PROFILE-001 | 空画像、已有目标／技能／偏好／缺口，手动同步、服务器失败。 | 真实数据及来源可读；失败不假空；同步不覆盖正编辑Dialog。 | DATA profile／UI；伪成功或编辑丢失即失败。 |
| PG-PROFILE-002 | 目标role增删／level／salaryMin-Max／dealBreakers；空role或min>max。 | 有效精确保存；无效不写；manual目标锁定可读。 | DATA goals、UI校验；错误范围落盘即失败。 |
| PG-PROFILE-003 | 技能名／熟练度0/50/100／evidence，新增／删确认／取消／全删。 | 正确技能保留、来源及锁定；至少保留限制符合当前交互；取消不写。 | DATA skills／UI；删错或值超界即失败。 |
| PG-PROFILE-004 | confirm／reject／edit／delete技能候选；缺证据、重复候选。 | 未确认不冒充真实技能；确认来源可追溯；拒绝不提升，编辑精确。 | DATA signals／skills、UI；只Toast或无证据升格即失败。 |
| PG-PROFILE-005 | manual锁定目标／技能后Agent更新，解锁后再更新。 | 不静默覆盖人工事实；冲突明确；新规则与settings/CV职业方向一致。 | DATA前后diff、LIVE；越过锁定即失败。 |
| PG-PROFILE-006 | 雷达、缺口、偏好柱及0／缺字段；打开历史详情／“还原”。 | 图值对应事实；历史来源时间正确；未实现真还原必须明确，不报已恢复。 | UI数值与DATA history；固定假图／伪还原即失败。 |
| PG-PROFILE-007 | JSON导出后解析；重置取消／确认／500；重载。 | JSON字段与本人一致；重置成功才改state和cache；失败不宣称已重置。 | FILE解析、DATA、UI；伪重置或漏／混用户即失败。 |
| PG-PROFILE-008 | settings职业资料→profile→CV方向→Agent查画像；反向修改再看。 | 同业务字段含义和权威源一致；冲突明确，不产生三套静默不同数据。 | 各页UI与DATA/local映射；跨页读不到新值即失败。 |

## 13. 私人记忆（9 项）

前置：普通／敏感／过期候选、来源明确的fact与派生索引；A/B隔离。步骤：查看来源→确认或拒绝→纠正／清除→新查询验证不再使用旧内容。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-MEM-001 | 候选／facts／source／partition／expiry、空集合及加载失败。 | 数量与来源对应本人；空与不可用区分；不展示他人事实。 | DATA、UI集合；错误当无记忆即失败。 |
| PG-MEM-002 | 普通候选确认／拒绝；刷新并真实检索。 | confirm才成为有效fact；reject不影响建议；重复提交幂等。 | DATA candidate/fact／retrieval；只有Toast或重复fact即失败。 |
| PG-MEM-003 | 薪资／签证／健康敏感候选确认，再取消／同意二次确认。 | 取消不写；同意限定求职辅助用途，状态／来源可追溯。 | NET consent、DATA、UI；没同意已生效即失败。 |
| PG-MEM-004 | 自动发现关闭／开启；关闭后闲聊与“请记住”。 | 清除未确认闲聊候选，保留有效事实；显式单次请求仍可处理，不开启后台自动发现。 | DATA设置／候选、LIVE新session；关闭仍升格即失败。 |
| PG-MEM-005 | 过期／重复／冲突／已拒绝候选再出现。 | 过期不生效，去重／冲突有可解释状态；不能偷偷复活已拒绝记忆。 | DATA生命周期／检索；错误事实参与推荐即失败。 |
| PG-MEM-006 | 纠正fact，空／相同／取消、有效replacement＋source。 | 有效才写新事实、旧失效；新查询和页面使用新值；来源依据保留。 | DATA版本／retrieval、UI；只改显示或旧值继续用即失败。 |
| PG-MEM-007 | erasure准备范围→取消／确认；派生副本读回。 | 清目标及派生记忆；取消保留；原始对话/CV/report按提示保留。 | DATA各store／索引及清除request；少删派生或误删原件即失败。 |
| PG-MEM-008 | 清除后新session检索、缓存、embedding失败／重建索引。 | 不再回忆已清fact；失败状态可见并明确降级；旧索引不复活。 | retrieval、DATA健康／LIVE回答；假无记忆或旧值复用即失败。 |
| PG-MEM-009 | support-access授权scope／expiry／revoke、A/B篡改ID。 | 当前无UI的能力记为认证API集成；仅允许授权范围，撤销／过期生效。 | API与DATA grant／访问审计；无授权读取或假计浏览器UI已测即失败。 |

## 14. 设置与数据管理（9 项）

前置：服务器与localStorage／IndexedDB不同的唯一标记数据；A/B同浏览器换号，备份文件与CLI样本。步骤：真实输入→保存→重载→跨页读回；清除只对隔离fixture。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-SET-001 | 姓名／email／电话／城市／LinkedIn／GitHub／portfolio更新。 | 本地持久化及消费页面一致；PDF取对本人资料；不能误称已同步服务器。 | local独立读回、FILE、DATA对照；错profile或误导保存即失败。 |
| PG-SET-002 | headline／targetRole／优势增删／salary/flexibility；非法URL、超长值。 | 字段含义一致、不注入脚本、薪资合法；profile／CV／Agent使用权威内容或明确限制。 | local/DATA跨页、UI；只settings成功即失败。 |
| PG-SET-003 | targetCompany新增重复／删除、news interval；服务器保存故障。 | 去重；服务器目标company与本地一致；失败提示明确，首页不会读旧目标假成功。 | NET、DATA goals／首页新闻；混合存储静默分歧即失败。 |
| PG-SET-004 | 导出全部投递，服务器有16条但IndexedDB为空，再解析文件。 | 导出应与用户所见“全部”范围一致；若仅本地必须明确范围；记录／状态完整。 | FILE解析与DATA集合；下载非空或空文件假成功即失败。 |
| PG-SET-005 | Markdown导入正常／重复／同公司不同role／坏格式／非md。 | 导入数量以实际新增为准；不重复、不误合并；tracker/home可见或明确仅本地。 | FILE、local/DATA、UI；Toast声称导入却跨页无数据即失败。 |
| PG-SET-006 | CLI导入有／无／已存在／部分坏记录、已有profile。 | application/report/profile映射正确；不覆盖现有有效profile；实际新增计数正确。 | CLI样本、local/DATA、UI；缺报告正文假完整即失败。 |
| PG-SET-007 | 清除取消／确认；所有表、另一tab、刷新、服务器再读。 | 提示范围与实际一致；只清local不声称全账户清除；取消无删。 | local/DATA前后、UI；遗漏表或误删服务器即失败。 |
| PG-SET-008 | A设置／导入／故事后退出→B登录→导出／PDF／面试看板。 | B无A资料、文件或local记录；A重新登录可按约定恢复。 | A/B UI、local与FILE；任意敏感残留即失败。 |
| PG-SET-009 | local JSON损坏、storage禁用／满、IndexedDB失败；账户改密入口。 | 可恢复错误、不永久loading；不吞保存失败；改密到正确认证链。 | UI／console、local写入结果；假保存或丢可编辑内容即失败。 |

## 15. 分析、拒信和真实结果（8 项）

前置：`PG-F1`及不同周的申请、已评分／未评分、实际拒信与未知原因、实际薪资材料；拒信／薪资通过真实Agent入口。步骤：比对统计→生成周报或记录反馈→查来源→纠正→跨页读回。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-AN-001 | 总数／八状态／平均／漏斗与home/tracker比对；零数据。 | PG-F1总16、各2、平均4；零样本无NaN／Infinity；量纲一致。 | 独立手算DATA、UI；“图存在”但数字错即失败。 |
| PG-AN-002 | 4w／8w／all，9周前记录、未来／无效日期、跨年。 | all包含合法9周前记录，4w/8w按定义；日期不错周，排序稳定。 | fixture日期oracle、UI／DATA；all仍8周或偏日即失败。 |
| PG-AN-003 | Pipeline健康比例0／19.9%／20%／39.9%／40%、14/15天异常与跟进。 | 健康颜色／文案按准确比率；边界明确，提醒对象和时间正确。 | DATA手算与UI；颜色与比率矛盾即失败。 |
| PG-AN-004 | 感知summary、图表、大数据、API不可用恢复。 | 事件totals/daily与真实记录一致；不可用明确，不伪0、不破坏申请图。 | DATA events、UI；静态假图或跨用户计数即失败。 |
| PG-AN-005 | `[LIVE]`AI周报，冻结当周数据，重复点击／超时／缺字段。 | 时间范围正确；引用真实申请/Offer；未知面试数据明确，不编造；失败可恢复。 | NET输入＋DATA oracle＋LIVE；只有alert出现即通过失败。 |
| PG-AN-006 | rejected共2条但无拒绝原因；有真实原因后比较图／Offer预测。 | 当前固定比例和预测必须标估算/参考；未知不当真实技能／薪资拒绝统计。 | UI标签、DATA拒信证据；把40%等伪精确事实即失败。 |
| PG-AN-007 | `[LIVE]`明确拒信／延期／候选池／用户猜测→记录→复盘→纠正；另明确请求记录拒绝阶段。 | log_rejection_notice只按实际语义保存notice/候选证据，不假定自动改application；用户明确要求改阶段时调用update_application_status并读回正确对象；不确定原因不成事实。 | DATA notice/candidate/source、独立status操作及LIVE；只记录拒信就宣称改阶段／延期误拒绝／错岗位即失败。 |
| PG-AN-008 | `[LIVE]`实际录用／薪资反馈，K/元/月/年，地点／日期／来源；撤回。 | 写对应个人对象；真实与估计区分；撤回不再供派生参考，B不受污染。 | DATA薪资/offer/来源、检索＋LIVE；单位错／无来源或跨用户即失败。 |

## 16. 后台管理（12 项）

前置：Admin／SuperAdmin及不同状态测试用户；安全事件、团队参考、run／trace／review数据预置；所有管理变更仅隔离环境。步骤：管理UI操作→独立读回→受影响账号或业务页验证。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-ADMIN-001 | member/admin/superadmin打开7后台页及对应API、篡改身份参数。 | 依真实角色策略允许；隐藏不等于安全；普通用户直接访问受拒且无数据。 | HTTP、UI、DATA无变更；越权或泄露即失败。 |
| PG-ADMIN-002 | users状态过滤、审批批准／拒绝、找回请求处理。 | 状态数量准确；正确targetId；批准可登录、拒绝不可；有审计。 | DATA用户／recovery／audit、目标登录；只管理员Toast即失败。 |
| PG-ADMIN-003 | 禁用／恢复／删除成员，取消、自己／最后superadmin保护。 | 真实状态改变、旧会话失效；最后管理权限不丢；取消不删。 | DATA角色数、旧token／任务授权；锁死系统或错删即失败。 |
| PG-ADMIN-004 | 升／降角色step-up，错误／过期／限流／取消；当前标签再访问。 | 正确新角色与tokenVersion；仅有授权可执行；前后API权限一致。 | NET step-up、DATA／审计；绕过或旧token越权即失败。 |
| PG-ADMIN-005 | 重置密码、一次展示／复制／关闭、目标临时登录改密。 | 原密码及旧token失效；强制改密闭环；不日志泄露临时密码。 | DATA、目标UI、脱敏日志；临时密码重复暴露或无强制即失败。 |
| PG-ADMIN-006 | security-events筛选／分页／detail、空／失败状态。 | eventType/actor/target/outcome/source/time与真实动作一致；分页无重漏。 | DATA审计ID、UI；假事件／错actor即失败。 |
| PG-ADMIN-007 | memory团队参考批准／退回，pending/private/team的A/B检索。 | 批准才可团队使用；private不被B看见；状态和队列数真变化。 | DATA scope/status、检索ID；仅隐藏按钮即通过失败。 |
| PG-ADMIN-008 | reference停用／恢复／删除二次确认、embedding reindex失败后恢复。 | 状态决定可检索；删除范围准确；reindex实际修复健康，失败不报成功。 | DATA索引/材料/健康、retrieval；旧索引继续用即失败。 |
| PG-ADMIN-009 | candidate pattern批准／拒绝／归档、低质量/高拒绝队列、insights。 | 队列计数及判定来源真实；批准不伪装已证实个人事实；insights权限正确。 | DATA模式/指标、UI；固定数或跨用户私密泄露即失败。 |
| PG-ADMIN-010 | run状态过滤／events／checkpoint／steps／attempts／Worker心跳。 | 同run状态一致；queued/running/waiting/terminal可辨，费用预算来源真实。 | runtime DATA与UI；只有online标签却Worker失联即失败。 |
| PG-ADMIN-011 | 隔离环境pause/resume claims、修复/outbox命令及重复request。 | 仅预期run受影响、幂等；不能误停别的run；失败明确，已领取任务语义正确。 | DATA命令/租约/事件、NET；只按钮变色即失败。 |
| PG-ADMIN-012 | traces调用树、reviews筛选/detail/evidence、eval candidate审批。 | run/agent/model/token/cost/来源关联正确；审批状态真保存；不把评价称修复已验证。 | DATA trace/review/candidate、UI；错run/错用户/无证据结论即失败。 |

## 17. 视觉、响应式和可访问性（7 项）

前置：所有主题及viewport矩阵，短／长内容与loading/error/empty/ready；截图baseline先由人工确认。步骤：真实打开、滚动、缩放、键盘交互、打开软键盘，再采集几何和视觉证据。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-VIS-001 | 首页、discover、JD/report、CV、tracker、interview、offer、profile、memory、analytics、admin各状态截图。 | 品牌层次、字体、留白、图表、状态和主操作可读；美术不遮业务文字。 | 同fixture截图diff＋人工审查；仅“高级感”主观一句即通过失败。 |
| PG-VIS-002 | light/dark三图／各背景、图片加载失败、reduced-motion。 | 正常资产正确呈现；缺图可读fallback；无剧烈动画且信息不丢。 | 资产NET、截图、computed animation；只有一个资产／停动画停功能即失败。 |
| PG-VIS-003 | 矮窗600高、390/320px、横屏、125/200%缩放；长表/看板/图。 | 无整体横溢出；必要内部滚动可用；关键保存/确认/关闭不被裁掉。 | rect／scroll尺寸、滚动后UI；只能截图上半页即失败。 |
| PG-VIS-004 | 真机或声明支持的移动引擎打开输入软键盘、旋转、地址栏伸缩。 | 聚焦字段与动作可见，safe-area正确；键盘关闭恢复；viewport模拟不能冒充真软键盘。 | 视频／viewport/focus rect；关键按钮遮住／跳页即失败。 |
| PG-VIS-005 | Tab/Shift+Tab、Enter/Space/Esc；Dialog/Sheet/菜单、拖拽替代。 | 焦点可见，顺序合理、trap/return正确；键盘完成真实业务，非颜色唯一状态。 | 焦点轨迹、DATA动作结果；只测aria属性即通过失败。 |
| PG-VIS-006 | headings/label/错误/状态/读屏名称；图表数值与来源。 | 控件名称唯一可辨；错误指向字段；loading/status可感知；图表可获实际值。 | accessibility tree、实际交互；无label／读不到结果即失败。 |
| PG-VIS-007 | 同route反复切换、Modal滚动、Agent→普通页、图片慢载。 | 高度稳定，无残留滚动锁/焦点/布局大位移；内容可滚到底并返回。 | rect时序／overflow/console；偶然恢复当根因修复即失败。 |

## 18. 性能、资源与订阅清理（4 项）

前置：固定候选production build及Web/Worker/DB版本，记录CPU/RAM、浏览器、网络与fixture；不能用dev编译时间混入生产首屏。空数据与500/1000条列表分别取至少5次独立样本，冷热缓存分组。下面数值是**待用户确认的候选门槛**，未确认前记录实际值和回归幅度，不把自行选的数值标为已批准发布预算。性能等待使用真实事件和可操作状态，不用固定sleep或降低fixture规模凑通过。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-PERF-001 | production build冷/热缓存访问首页、tracker、CV、report、admin；受控网络下实际点击首个主操作。 | 候选：LCP p75≤2.5s、INP p75≤200ms、CLS≤0.1；首个主操作有正确业务响应而非仅屏幕骨架；真实AI耗时独立记账。 | Performance trace/ResourceTiming、样本原值、DATA操作结果；预算确认前只能报告，达到视觉指标却操作无效仍失败。 |
| PG-PERF-002 | 500/1000条tracker/JD/report/发现列表执行搜索、筛选、排序、开详情、导出；长CV预览/下载。 | 集合和文件必须完整；候选：本地筛选/开详情p95≤300ms，受控API可交互p95≤2s，PDF≤15s；不裁数据换速度。 | 浏览器mark到实际结果、NET/FILE/DATA核对；漏记录/丢输入先判正确性失败，时延按确认预算判断。 |
| PG-PERF-003 | agent/普通页/扫描/Modal循环导航20次、反复开关标签/焦点、退出重登；终止任务后再采样。 | SSE/poll/timer/listener/ResizeObserver随离开清理；每任务最多一条应有连接/轮询，终态停止；候选稳定后heap增幅≤20%，DOM回归基线±10%。 | 连接/请求计数、listener/heap/DOM采样及cleanup日志；增长持续、ghost订阅或重复写入失败，不仅看一次GC值。 |
| PG-PERF-004 | 慢网/429/断线重连、server失败、多个标签；恢复后观察请求/Worker资源。 | 重试有界退避、同requestId幂等，无并行请求风暴；候选恢复30s内回到配置的单连接/轮询频率，任务执行次数不翻倍。 | NET完整时间线、队列/attempt/CPU/RAM/DB计数；无限重试、忙循环、跨tab重复业务副作用即失败，先按真实配置oracle判定。 |

## 19. 安全、数据隔离与可靠性（8 项）

前置：A/B唯一标记、隔离服务和故障代理；恶意文件/文字仅测试payload。步骤：正常UI动作后直接验证对象权限，故障恢复后核对服务端。接口专用能力明确记为集成，不能假称UI已测。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-SEC-001 | A/B跨context与同浏览器换号读各类对象、导出、session/artifact下载。 | profile/CV/JD/report/application/offer/memory/story/练习/scan全隔离；本地无敏感残留。 | A/B DATA/FILE/UI矩阵；任一对象泄露即失败。 |
| PG-SEC-002 | 篡改URL/body对象ID读取／PATCH／DELETE／download，含admin ID。 | 403/404且无数据或副作用；存在性不被错误细节大量泄露。 | NET与DATA前后；只UI隐藏即通过失败。 |
| PG-SEC-003 | 未登录／过期session的PDF/artifact/SSE/API；CSRF错／缺／跨Origin。 | 受保护读取和变更拒绝；合法UI自动token续期成功，凭据不出浏览器公开包。 | HTTP/cookie/构建静态搜索；绕过或误拦正常流程即失败。 |
| PG-SEC-004 | JD链接私网/localhost/metadata/重定向；合法公开招聘链。 | SSRF阻止内网访问，重定向重新校验；公开链正常取正确正文。 | 受控服务器访问日志、NET；可探内网或伪内容即失败。 |
| PG-SEC-005 | JD/CV/report/offer/news/STAR里的HTML/Markdown脚本、javascript链接。 | 页面和PDF渲染安全、无脚本执行；内容不会破坏其他控件。 | 浏览器执行探针/FILE/console；仅字符串存在即证明安全失败。 |
| PG-SEC-006 | 上传路径穿越、伪MIME、超大/坏文档/图片；模型提示注入。 | 文件范围和限额执行；材料文本不成为管理指令，不触发越权写入或泄露。 | NET、隔离文件/DATA、LIVE；无关工具被调用即失败。 |
| PG-SEC-007 | mutation双击/重试、响应成功但readback不同、并发、401/409/429/500/503。 | 幂等、真结果/错误可见、不覆盖新revision；失败不能报成功。 | DATA次数/revision、UI/NET；仅mock成功或乐观state即失败。 |
| PG-SEC-008 | 断网恢复、Web/Worker重启、DB暂断、长列表/坏JSON；查看日志。 | 已确认成果不丢、可恢复且来源正确；日志/截图不漏key/JWT/密码/完整个人材料。 | DATA恢复前后、脱敏日志、UI；永久loading/凭据泄露即失败。 |

## 20. 更新日志、发布和回归记账（5 项）

前置：候选build、版本文件、同一数据集；部署／故障仅获授权环境，生产限定只读烟测。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-REL-001 | `/changelog`当前与历史版本、日期、展开/收起；对VERSION/package。 | 当前0.13.2一致，后续变更按候选版本；计划文档不能当生产已发。 | 文件元信息与UI；版本混淆即失败。 |
| PG-REL-002 | 新构建启动Web+Worker、认证/DB/Redis/模型preflight；打开关键页。 | 实际build标识、服务readiness准确；缺Worker不得宣称全功能可用。 | build/进程只读字段、真实API/UI；只Web200即通过失败。 |
| PG-REL-003 | 候选升级前后同fixture，重载/旧标签续用；普通页滚动回归。 | 数据/版本迁移无丢、旧客户端可恢复或明确刷新；外壳scroll锁不扩散。 | DATA前后/版本、UI几何；数据没了或input错位即失败。 |
| PG-REL-004 | 经授权隔离部署/回滚，运行只读关键烟测。 | 当前release、Web/Worker运行目录一致；回滚后数据及权限正确。 | 安全进程字段/版本、DATA/UI；只软链变化即通过失败。 |
| PG-REL-005 | 汇总本文件及Agent文档的pass/fail/blocked/skipped/待实现证据。 | browser/mock/API/Vitest/LIVE分开计数；未配置模型不报通过；每失败附复现。 | runner原始report/trace；只有手填通过或跳过算通过即失败。 |

## 21. 四条必须真正走通的跨页旅程（4 项）

前置：每条使用独立fixture和账号；跨Agent步骤调用Agent规范对应真实流程，用同一session/run/object ID串起证据。每一步都检查屏幕、请求、权威读回，不以最后一页“看起来正常”代替中间验收。

| ID | 输入／操作 | 业务正确性与持久化验收 | 独立证据及失败判据 |
| --- | --- | --- | --- |
| PG-JOURNEY-001 | 注册→审批→设置→CV→发现→Agent→报告→tracker→interview→Offer→memory→首页/分析。 | 依下列完整步骤，每一步对象/来源/统计一致，实际输出满足质量。 | 一条贯通trace、DATA ID链、FILE/LIVE；任一步仅mock/错绑/假成功则全旅程失败。 |
| PG-JOURNEY-002 | 错误导入/技能推断→纠正→重新评估→CV并发→确认保存→旧report stale。 | 旧错误不继续使用，人工锁/新版本不被覆盖，新成果可读回。 | 事实/版本diff、冲突响应、LIVE；只改聊天文案无数据纠正即失败。 |
| PG-JOURNEY-003 | 记忆拒绝/发现关闭→纠正/清除→团队撤销→退出换B→检索/导出。 | 未授权与已清除信息不参与建议；原件范围明确；B不获A材料。 | DATA各层/索引/FILE/LIVE；任一派生/缓存泄露即失败。 |
| PG-JOURNEY-004 | HR拒信/实际Offer/薪资反馈→关联application→来源→明确改阶段→复盘/统计→用户纠正/撤回。 | 拒信notice/候选与application状态操作分开；需改状态时明确update_application_status读回；事实/估算区分，纠正后不复用旧值。 | 原材料与DATA、工具操作/统计oracle/LIVE；单notice假宣称已改阶段／固定比例当事实即失败。 |

### PG-JOURNEY-001：从注册到录用

1. 新用户注册，读取用户为member/pending；审批前登录受拒。Admin经UI批准，用户重新登录为active。
2. 在settings设置唯一姓名、联系方式、目标公司、role、薪资范围。分别在local与服务器读回；profile/CV消费的数据不同则记录阻断，不绕开接缝。
3. 上传带独特经历和真实数值的CV；检查完整提取。待确认版不覆盖原版；确认并保存后新session读取同版本。
4. discover输入确定岗位词和城市，扫描受控招聘页；打开目标机会，保存完整JD，数据库只有一条且source为discovery。
5. 通过实际按钮进入Agent评估同jdId；`[LIVE]`检查A–G、company/role/事实、薪资来源/未知项，并读取真实报告。
6. 报告页打开同reportNum，下载PDF解析A–G及中文正文；加入tracker两次仅一个application，关联jdId/reportNum准确。
7. tracker标投递、HR回复、录入第一场面试日期/轮次。每步刷新真实保存；首页今天提醒与面试看板日程一致。
8. `/interview`选目标JD和当前CV，模式/难度/focus确认后启动。新session计划快照准确；`[LIVE]`完成问答/追问/评分/recap，返回看板打开原转录。
9. tracker标Offer，庆祝不重复写；compare录入30K×14+20K。保存年现金440K；Agent评估/谈判使用此Offer而非同公司另一岗位。
10. 产生候选记忆，用户明确确认才有效；敏感事实二次同意。新会话检索有正确来源。
11. 回首页及analytics，根据本旅程实际新增记录手算前后差值；同application不重复累计，不把阶段状态数误当独立成果数。保存全链ID、下载文件和真实模型证据。

### PG-JOURNEY-002：纠错与版本冲突

1. 导入覆盖不完整的CV；待确认版及原版都存在，显示覆盖缺口。手工补齐真实经历后保存V2。
2. Agent从材料推断候选技能；profile显示candidate及证据。用户拒绝错误技能、修改正确技能并手工锁定目标。
3. `[LIVE]`重新评估同JD；输出仅使用纠正后的技能，已拒绝猜测不得成为本人事实，锁定目标不被覆盖。
4. 两tab读取V2；Agent提案获批准生成新版本，旧tab保存时检测冲突或要求明确决定，不能覆盖新版。
5. 用户在正确版本确认栏目优化并保存；下载PDF解析该版内容与真实数字，排除未接受草稿。
6. Offer或JD条件修改使旧报告不再最新，显示stale/更新需要；新评估关联新输入，旧report仍可审计但不假装适用。
7. 刷新profile/CV/report/Agent/home，独立DATA证明纠正、版本、来源都一致；任何页面继续旧事实即失败。

### PG-JOURNEY-003：隐私与清除

1. A产生普通与敏感候选；拒绝一条、取消敏感确认。数据库不出现有效fact，新建议不采用这两条。
2. 关闭自动发现；闲聊不新增可用记忆，已确认fact保留；明确“请记住”单次处理不自动开启开关。
3. 纠正一条fact，填写依据；旧fact失效，新session `[LIVE]`使用新值，来源正确。
4. 清除另一条fact，先看准确范围并取消，证明零删除；再次确认后fact/索引/派生记忆移除，但原始对话/CV/report按提示保留。
5. 撤销或停用A团队参考材料；B新检索不可获得，不因索引缓存继续返回。
6. A退出、同浏览器登录B，检查settings、面试故事/练习、CV预览/PDF、MD导出、memory及session直链。所有A唯一标记不可见。
7. API篡改A对象ID及撤销support grant后读取受拒；恢复A后可见范围与清除承诺一致。不得为了让隔离通过而在测试中手工清storage掩盖产品残留。

### PG-JOURNEY-004：真实反馈与统计

1. 为同公司两岗位建立独立application。提交明确拒信给岗位1，`[LIVE]`识别拒绝、原因、source和不确定性；独立读取log_rejection_notice实际保存的notice及候选证据，不假定该单工具已改变application。随后用户明确请求“把岗位1记录为已拒绝”，调用update_application_status并读回；仅岗位1状态改变，岗位2不变。
2. 对岗位2提交“仍在评估/候选池”通知，不能误标rejected；用户推测原因不得当HR事实写入。
3. 为岗位2录入真实Offer与薪资反馈，明确30K/月、14薪、20K年奖金及日期/地点/来源；读取年现金440K，不能把K当元。
4. 回tracker/compare/profile复盘，引用正确材料；analytics若没有真实拒信聚合功能，明确当前估算限制，不能将固定40%/25%等说成这封拒信产生的事实分布。
5. 用户修正拒绝原因与金额，说明依据；旧结论/薪资派生记录失效，最新report/建议用新值，B数据不变化。
6. 用户撤回该反馈，再查询所有相关来源/索引；原始材料按策略保留，但撤回事实不能继续参与推断。形成金额、状态、来源及统计前后证据。

## 22. 已知实现接缝与执行顺序

以下是源码观察，**不是已复現／已修复结论**，实现测试时必须真实验证：

| 接缝 | 源码依据 | 对应用例 |
| --- | --- | --- |
| settings本地profile/MD/清除与server tracker/home混用 | `src/app/settings/page.tsx`、`src/lib/db.ts` | PG-SET-001–008、PG-PROFILE-008、PG-JOURNEY-001/003 |
| tracker轮次数组在状态PATCH后追加前端state，需核对真正持久化 | `src/app/tracker/page.tsx`的saveInterview | PG-TRACK-005、PG-IV-009 |
| profile历史还原目前只是刷新/说明不支持快照 | `src/app/profile/page.tsx`的handleRestoreHistory | PG-PROFILE-006 |
| analytics拒绝原因固定比例、预测固定条件文案 | `src/app/analytics/page.tsx`的rejectionReasons/Offer预测 | PG-AN-006/007、PG-JOURNEY-004 |
| 拒信notice/候选保存不等同自动修改application状态 | `src/lib/agent/tools/action/log-rejection-notice.ts`；状态修改工具独立验收 | PG-AN-007、PG-JOURNEY-004 |
| history链接使用`/evaluate?id=`，总览未必打开对应报告 | `src/app/evaluate/history/page.tsx`、`src/app/evaluate/page.tsx` | PG-JD-008 |
| command palette仅接收number会话ID，需核对server字符串ID | `src/components/shell/WorkbenchShell.tsx`的openPalette | PG-NAV-003 |
| Agent外层锁需要离开route时恢复 | `src/components/shell/WorkbenchShell.tsx`的scroll lock effect | PG-NAV-006、PG-VIS-007、PG-REL-003 |
| CV PDF从本地profile读取个人资料 | `src/app/cv/page.tsx`的downloadPDF | PG-CV-011、PG-SET-008 |
| /interview实际启动依赖服务器CV/JD与session快照 | `src/app/interview/InterviewLaunchPanel.tsx` | PG-IV-002–005 |
| /explore是Agent跳转、无/outcomes独立页 | `src/app/explore/page.tsx`、实际src/app路由 | PG-NAV-008、PG-AN-007/008 |

建议执行顺序：认证及用户隔离→页面权威数据与跨页读回→CV/JD/report/tracker/interview/Offer主链→记忆与管理员→AI真实输出→故障注入、性能、视觉/手机/发布。新增170项唯一ID加参数矩阵；每个参数实例单独记结果。实现中发现产品缺能力时记录“实现缺口/待确认”，不能为获得绿色结果把预期改成当前错误实现。

删除、重置、全局暂停、数据库故障注入仅对隔离环境。线上烟测只读当前身份、页面、产物和服务状态，禁止以生产数据跑本清单的破坏性分支。本文提交前只做文档结构与ID检查，不运行任何业务模型、测试或部署。
