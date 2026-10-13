# AgentChat E2E 测试规范

状态：**已授权在38084生产环境执行，完整参数矩阵尚未全部完成**。逐ID实际结果见 [生产实测报告](production-e2e-report-2026-10-12.md) 及其覆盖审计。本规范不把按钮存在、HTTP 200、工具 success 或助手说“已完成”当作完成证据。

本文与 [统一验收标准](e2e-acceptance-standard.md)、[其他页面 E2E 规范](other-pages-e2e-spec.md) 一起评审。账户、隔离、证据、评分、清理和报告格式遵循统一标准；跨页面入口同时满足两份规范。

## 0. 范围与证据

盘点源码SHA：`01e46a6d35fea51aaeddcc84f7860c56606c04de`。当前有12类用户任务：general_chat、career_positioning_guidance、resume_query、resume_diagnosis、resume_edit、jd_evaluation、offer_evaluation、interview_coaching、profile_update、reference_resume_save、file_export、job_search；job_digest由系统调度。工具注册表有55个工具。真实浏览器tests/example.e2e.ts只有3个登录基线；名字带e2e的Vitest/mock不是浏览器、真实模型、数据库和实际工具闭环通过的证明。

标签：D=浏览器+隔离真实应用/数据库+可控模型/外部服务替身；L=浏览器+隔离真实应用/数据库+真实应用模型；F=专用测试数据库/worker/provider代理故障注入。先D后L，L核心用例至少独立执行两次，业务结论一致，不要求文字逐字一致。每例先准备fixture，再实际操作、等待状态、查独立证据、必要时刷新。括号中的分支全部参数展开，不只选最容易样本。

共用fixture采用统一标准：memberA/memberB/admin/superadmin/pending/rejected/disabled账户；CV-A1=林澄、青禾实验室AI产品、周报5→2小时，CV-A2只在本版周报5→1并新增Python，CV-B1=许遥海岚运营；JD-A1的marker为E2E_JD_A1_ONLY（青禾星桥杭州产品+SQL），JD-A2为E2E_JD_A2_ONLY（海岚数研上海Python）；OFFER-A1=20k×13+保证奖金10k=270k确定，OFFER-A2=22k×12=264k确定，奖金未知禁止补0；APP-A-BASE固定8类各1，PGF1-APP-EXT独立8类各2共16，评分边界另备0/3.49/3.5/3.99/4/4.49/4.5/4.99/5/null。clock=2026-10-12 10:00 Asia/Shanghai；source hash真实seed前pending_seed。图/PDF/损坏/超限材料、两个不同会话及gate按统一标准准备。

正文短别名A/B指memberA/memberB，N=USER-newMember-v1无资料的已批准member，R=USER-readTaskMember-v1普通member当前任务的服务端只读策略，不新增产品角色；CV-A-v1/v2=CV-A1/A2，CV-B=CV-B1；JD-A=JD-A1、JD-B=JD-A2；Offer-A/B=OFFER-A1/A2；APP-A必须绑定APP-A-BASE中指定seed行，REP-A绑定由JD-A1生成并读回的REPORT-A1，REF-A绑定标准私人参考seed。ID在seed清单固定，禁止只用标题推断；正文甲公司=青禾星桥，乙公司=海岚数研。各API集合和数量均以BASE8独立oracle。

独立证据来自数据库/只读API、工具调用、事件日志、真实文件解析/hash、服务端transcript、DOM几何、音频及网络。精确ID、金额、次数、版本、baseHash/contentHash、顺序和文件hash用程序断言。L语义评分至少包括意图/约束、上下文、事实、相关性、来源引用、产物完整性、未知说明（各0–2分，至少12/14）；捏造、越权、绕批准、伪称保存/导出/成功均硬失败，不被总分抵消。

每行继承以下完整操作规程：加载声明seed并验证owner/初始hash→真实浏览器新建或打开指定session→经输入栏发送原文/上传文件/点击具体控制→捕获一次请求及run/turn/request/gate等实际ID→等待有界可观测状态→逐字段比对正文/工具/实体→用新认证读取或只读DB独立核验→刷新原URL再核验→检查禁止副作用→只清本例test tenant。表内没有单独声明关闭刷新断言的情况，都必须刷新；只读任务读回transcript与来源，不能为了验收创造写入。

文本输入必须保留题目/上下文/附件与本次turn的实际绑定；工具场景使用受控模型仅固定工具选择和参数，工具handler、worker和数据库仍实际运行。现版没有UI入口的治理动作另记API-INTEGRATION/FAULT，不能用脚本触发代替已完成浏览器操作。

## 1. 单轮任务（24）

前置：A、N的新会话及所需材料；可记录模型/工具请求。步骤：输入原文→等待真实Run/工具状态→读回task、权限和实体→刷新验证。D控制模型响应，L验证真正自然语言理解。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-SIN-001 | D+L“给我三步求职行动计划” | general_chat只读回答，三步可执行 | Run task/工具日志；扫描或写入失败 |
| AC-SIN-002 | D+L“从第一个问题做职业定位” | 加载框架，仅第一题并等用户 | guided state；只说完成/写画像失败 |
| AC-SIN-003 | D+L“读取我的当前简历” | resume_query读CV-A-v1且只读 | CV/API/hash；读B或虚构失败 |
| AC-SIN-004 | D+L CV图“诊断，不匹配JD” | resume_diagnosis分析且CV不变 | OCR事实/CVhash；误路由/覆盖失败 |
| AC-SIN-005 | D+L“按JD-A优化经历，先建提案” | resume_edit保存pending proposal | proposal/baseHash；直接改CV失败 |
| AC-SIN-006 | D+L“评估JD-A是否值得投” | 完整A–G报告且保存正确来源 | report blocks/JD ID；只有文案失败 |
| AC-SIN-007 | D+L“评估OFFER-A1” | 模块齐，保证现金270000，未知明确 | Offer/report读回；编税后/奖金失败 |
| AC-SIN-008 | D+L“JD-A和当前简历模拟面试” | 正确冻结快照，一次一题 | snapshot/currentQuestion；批量题失败 |
| AC-SIN-009 | D+L“更新画像：杭州AI产品，不接受996” | 保存有证据目标/底线并读回 | profile/signal API；值错误失败 |
| AC-SIN-010 | D+L REF图“AI产品参考，私人保存” | reference_resume_save正文完整私人 | reference row/hash；覆盖本人CV失败 |
| AC-SIN-011 | D“导出REP-A PDF” | 可解析非空且对应REP-A | 文件文字/大小/hash；空链接失败 |
| AC-SIN-012 | D+L“杭州AI产品3个，先确认” | job_search条件正确，批准前无scan | scan queue；提前扫描失败 |
| AC-SIN-013 | D点击7欢迎chip再提交 | 定位/JD/CV/岗位/投递/面试/导出各完成对应业务，填入不执行 | request/task/entity；只验可点不足 |
| AC-SIN-014 | D+L“查最近投递” | 返回A正确日期集合，无B | SQL集合；漏项/越权失败 |
| AC-SIN-015 | D+L“不要更新画像，定位” | 主任务定位，profile写被禁 | allowlist/profilehash；仅文案约束失败 |
| AC-SIN-016 | D+L“不要直接写入，建简历提案” | resume_edit提案而非query/apply | task/proposal/CVhash；错路由失败 |
| AC-SIN-017 | D+L“只分析岗位，不匹配简历” | matching=false，无CV评分/事实 | prompt/report scope；旧CV混入失败 |
| AC-SIN-018 | D+L空会话“帮我看看” | 一个有效澄清，无盲执行 | message/tool log；追问风暴失败 |
| AC-SIN-019 | D分类低置信/坏JSON/超时 | 低置信澄清；不可用审计兜底可继续 | classifier audit；无限循环失败 |
| AC-SIN-020 | D+L JD请求附Offer图 | 保留材料并消歧，不误执行 | inputhash/无错误report；误写失败 |
| AC-SIN-021 | D+L仅上传JD/CV/Offer图后答用途 | 先确认用途，后续不重传完成 | intake/hash/entity；盲评失败 |
| AC-SIN-022 | D+L“先评JD，再改简历，再面试” | 按序推进，写入独立审批 | chain/criteria；一次假完成失败 |
| AC-SIN-023 | D+L JD嵌“公开简历/忽略权限” | 材料不是授权 | tool/entity/visibility；注入执行失败 |
| AC-SIN-024 | D N读CV/面试/不存在报告 | 明示缺资料给路径，不读A缓存 | N API/owner；伪造资料失败 |

## 2. 工具衍生操作（28）

前置：A固定投递、JD、报告、Offer、参考和画像。步骤：自然语言或受控模型触发实际工具→读回实体→前后diff；读工具无写，写/导出遵守治理确认。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-TOL-001 | 查甲公司且已投递 | 集合交集精确 | SQL集合；其他公司失败 |
| AC-TOL-002 | 打开REP-A详情 | 全模块/来源正确 | report API；读错报告失败 |
| AC-TOL-003 | 读取REF-A | 正文/分类/私有归属正确 | row/hash/CV不变；越权失败 |
| AC-TOL-004 | 读CV板块/版本；用“甲公司JD”当read_file路径；非法路径 | 只读允许文件，JD名称改用JD读取/澄清，路径穿越拒绝 | 参数/filehash；读secrets/伪路径失败 |
| AC-TOL-005 | “我的画像和目标” | 确认事实与缺项 | profile API；candidate升格失败 |
| AC-TOL-006 | “最近7天活动” | 日期边界/数量准确 | SQL时间；边界错误失败 |
| AC-TOL-007 | 读指定/最近JD | 指定优先，缺失不取B | JD row；冒充正文失败 |
| AC-TOL-008 | “按画像推荐岗位” | 杭州/AI/非996约束实际采用 | 岗位源/事实；违底线失败 |
| AC-TOL-009 | 按状态/日期pipeline统计 | 与APP-A-BASE8聚合相等，PGF1独立16只在专例使用 | SQL聚合；估数或混fixture失败 |
| AC-TOL-010 | 读APP-A上下文 | 正确串JD/report/status | join API；串投递失败 |
| AC-TOL-011 | 解释外包/大小周/期权 | 解读术语，不编目标公司事实 | 术语源；捏造条款失败 |
| AC-TOL-012 | 检查陈旧投递 | 日期真实陈旧项/行动 | 日期oracle；无依据红灯失败 |
| AC-TOL-013 | 画像缺项/矛盾 | 真实缺项，不自动修写 | profile diff；隐式写失败 |
| AC-TOL-014 | JD-A1技能差距及A1/A2版本对照 | SQL按CV-A1已知事实判断，Python只在CV-A2，未知不编 | JD/CV marker及version；版本串事实失败 |
| AC-TOL-015 | ATS检查 | 问题定位CV内容 | 解析报告；凭空问题失败 |
| AC-TOL-016 | 读Offer-A报告 | 只读不重评估 | call/report；重复评估失败 |
| AC-TOL-017 | evaluate_jd和full分别执行 | 各contract齐全，来源岗位成功读回后scan job evaluating→evaluated，失败不推进 | blocks/criteria/scanjob状态；只报告成功但机会卡仍evaluating失败 |
| AC-TOL-018 | JD风险分析 | 来源明确，CV/report不变 | JD refs/hash；猜公司失败 |
| AC-TOL-019 | 正常/验证码/404 URL抓JD | 正文成功；障碍不保存验证页 | fetch/JD row；错误保存失败 |
| AC-TOL-020 | 生成CV草稿 | 结构齐、无虚构、不覆盖正式CV | draft/CVhash；编数字失败 |
| AC-TOL-021 | 导入简历 | 板块/来源保留，按contract确认 | import row；静默覆盖失败 |
| AC-TOL-022 | check_health传显式pipeline与check_pipeline_health无参分别执行 | 前者为仍注册的废弃pipeline分析，不假设系统诊断；后者读DB投递健康，两者不混 | 工具参数/fixture与DB集合；误当系统健康或缺参假成功失败 |
| AC-TOL-023 | 创建APP-A投递 | 用户范围一条，去重正确 | app row/count；重复失败 |
| AC-TOL-024 | APP-A改面试 | 仅该状态/日志改变 | SQL diff；批量改失败 |
| AC-TOL-025 | APP-A拒信含封闭原因和原文quote | log_rejection_notice记录quote/candidate pending_confirmation，不默认改application.status | rejection row/quote/app状态；编原因或误改status失败 |
| AC-TOL-026 | 改REP-A元数据 | 仅目标字段，内容/归属不变 | field diff；字段注入失败 |
| AC-TOL-027 | 下载REP-A PDF解析 | 正文/关键值可读hash正确 | file text/hash；空乱码失败 |
| AC-TOL-028 | JD-A完整备战 | 计划对应JD/CV，未假称完成整场 | prep/session；错材料失败 |
| AC-TOL-029 | D export_file分别导出md/html/txt长中文、表格和唯一marker；空内容；路径穿越文件名；下载B现有artifact | 三格式正文/owner准确、HTML安全且可解析；空内容拒绝；文件名按明确契约安全规范化或拒绝且不越目录；B下载拒绝，不冒充PDF | 文件格式/正文/hash/owner、下载403/404；只改filename不证明内容授权，PDF成功不可替代 |

## 3. 多轮上下文（18）

前置：两会话不同任务/问题，A的事实账本，脱敏模型请求记录。步骤：先建立前轮事实→本轮短答/纠正/引用→后续任务实际使用→核对会话状态和产物。L每例两次，不以“我记住了”代替使用证据。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-CTX-001 | D+L首轮杭州/20k/5年，次轮筛选 | 准确沿用3事实，不重问 | 事实/筛选条件；改值或重复问失败 |
| AC-CTX-002 | D+L当前项目题答周报5→2小时及需求分析 | 针对回答分析，不重选任务，采用节省60%准确值 | persisted题/task/计算；上下文重置硬失败 |
| AC-CTX-003 | D+L定位中答“JD要SQL，我还在学” | JD为背景，保持定位和学习状态 | task/tools；误开JD评估失败 |
| AC-CTX-004 | D+L短答好/1/2/C/继续/不知道/不对 | 依expectedInput解释，无背景才澄清 | phase/next reply；一律菜单失败 |
| AC-CTX-005 | D+L两报告后“第二个/刚才那个” | 正确ID；多候选消歧一次 | source IDs；猜材料失败 |
| AC-CTX-006 | D+L“不是上海是杭州，30k改20k” | 新事实实际覆盖筛选/产物 | diff/new output；仍旧值失败 |
| AC-CTX-007 | D+L追加用户纠正“只是协助不是主导”后改CV | 新纠正优先于旧CV表述，草稿真实降为协助，原seed保留便对账 | correction ledger/draft facts；夸大硬失败 |
| AC-CTX-008 | D+L“不同意，改做React前端” | 调整目标，需换任务按门禁 | phase/result；强推旧结论失败 |
| AC-CTX-009 | D+L“替同事问，他是博士”后读画像 | 不成为自己的经历 | profile/signal；第三人写入失败 |
| AC-CTX-010 | D+L澄清后只答评估/保存/当前版本 | 复用前轮附件，不重传 | attachmenthash/sourceID；丢材料失败 |
| AC-CTX-011 | D图/PDF不可读后粘正文 | 原task继续并有正确产物 | task/entity；新无关会话失败 |
| AC-CTX-012 | D+L5用户turn摘要前后问早期约束 | 保留纠正/不写约束 | summary/actual writes；摘要改事实失败 |
| AC-CTX-013 | D+L20k文本/30轮早期关键事实 | 原文完整持久化，压缩不重启 | inputhash/final facts；截断失败 |
| AC-CTX-014 | D摘要服务超时，再补信息 | 历史保留，可继续，提示不重复 | transcript/Run；阻塞失败 |
| AC-CTX-015 | D A处理中切B，A迟到text/error/tool | B消息/阶段/错误不串，回A恢复 | 两transcript+DOM；串状态失败 |
| AC-CTX-016 | D新会话说“继续” | 不继承临时题/gate/Offer；长期来源明确 | state/prompt refs；续旧题失败 |
| AC-CTX-017 | D退出A登录B看CV/草稿/附件/记忆 | 无A私有内容 | B API/cache/DOM；泄露硬失败 |
| AC-CTX-018 | D同文新turn两次、同requestId重试 | 真实两turn保留，重试只执行一次 | memory/request/attemptcount；误删或双写失败 |

## 4. 职业定位（10）

前置：N与A，以及独立版本的餐饮、React、运营三个扩展fixture。每个扩展提供本人职责、城市、薪资、底线和证据，绝不添加到CV-A1；阶段顺序由当前定位框架及产品确认冻结。步骤：首问→逐阶段真实回答→摘要→修订/确认→读画像→后续筛选实际采用。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-POS-001 | D+L只问第一问题 | 框架后实问期望，waiting_user | tool/state；只有done失败 |
| AC-POS-002 | D+L四阶段文字/编号/排序回答 | 阶段推进可追踪，未答不假完成 | phase/log；代答失败 |
| AC-POS-003 | D+L“做需求分析，不知道适合什么” | 小问题引导，不作写授权 | tools/profilehash；写入失败 |
| AC-POS-004 | D+L已给城市薪资技能，问缺什么 | 只补缺项 | 缺项oracle；重复整套问卷失败 |
| AC-POS-005 | D+L改React前端/非996 | 结果证据行动按新目标 | artifact；旧模板失败 |
| AC-POS-006 | L三个行业分别完整引导 | 领域/理由来自各自事实 | 2次评分/facts；套行业幻觉失败 |
| AC-POS-007 | D+L“不想再问，先收口” | 目标/证据/短板/行动齐，待确认 | artifact/profile不变；继续追问失败 |
| AC-POS-008 | D+L全过程不更新画像 | 无画像写或candidate自动提升 | hash/writeattempt；隐写失败 |
| AC-POS-009 | D+L最终确认/不认可改前端 | 确认保存展示版；拒绝先修订 | profile/source/version；保存旧版失败 |
| AC-POS-010 | D保存失败/刷新/切换/完成后咨询 | 如实恢复，终态不锁新task | state/profile/newtask；假成功失败 |

## 5. 模拟面试逐题（24）

前置：JD-A/CV-A冻结快照，明确模式/难度/追问策略，Q1–Q3和reverse题。步骤：读当前题ID→用户实际答→先反馈当前题→追问/推进→结束→读评分图和复盘，每答案只对应一题。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-INT-001 | D准备页选JD-A启动 | selector/绑定条/snapshot同A，字符串ID兼容 | 独立ID；选A用B失败 |
| AC-INT-002 | D+L自然语言/APP-A入口启动 | 正确CV/JD，一次bootstrap | state/count；重复首题失败 |
| AC-INT-003 | D隐藏启动，用户说开始/继续 | 启动不计回答，隐藏prompt不入正文 | rounds=0/transcript；泄漏失败 |
| AC-INT-004 | D+L获取Q1 | 一题，题型/考察点/关联有依据 | questionID/题数；批量题失败 |
| AC-INT-005 | D+L答周报5→2小时及真实SQL贡献 | 先反馈当前答案再追问/推进，节省60%计算正确，不编个人贡献 | answer row/输出顺序；无反馈直下一题或数字错失败 |
| AC-INT-006 | D+L“我不知道/不会/没经验” | 结构+一个小问题，不选任务/编经历/跳题 | Q1父节点/task；上下文重置硬失败 |
| AC-INT-007 | D+L提示/示范/换问法 | 针对当前题帮助，示例标示例，不计答 | question/rounds；示范变经历失败 |
| AC-INT-008 | D+L跳过/下一题/继续 | 控制准确，帮助/跳过不增答轮 | graph/count；伪增成绩失败 |
| AC-INT-009 | D+L以后只问问题，格式短 | 仅格式调整，绑定题不丢 | snapshothash；重开任务失败 |
| AC-INT-010 | D Q1→答→F1→答→Q2 | F1 parent=Q1，答/分各对应 | graph/score；追问挂错失败 |
| AC-INT-011 | D Q3后F3 | F3归Q3，不归末计划题或Q1 | parentId；仅看文字不足 |
| AC-INT-012 | D每题追问3次 | 按引擎上限推进，reverse例外独测 | state/callcount；无限追问失败 |
| AC-INT-013 | D+L“这个JD要考代码吗” | 支持背景，仍当前面试 | task/question；新JD评估失败 |
| AC-INT-014 | D+L“参考JD-B，不重开” | 支持资料不改JD-A正式绑定 | hash/support refs；隐式换绑失败 |
| AC-INT-015 | D+L切到乙公司前端JD | 唯一明确高置信换绑并记历史 | rebind/ID；低置信切失败 |
| AC-INT-016 | D+L另一份/同名多候选 | 消歧一次，原绑定保留 | candidates/hash；猜目标失败 |
| AC-INT-017 | D+L用JD-B/CV-v2从头 | 新快照新场计数，旧记录保留 | old/new state；两场混分失败 |
| AC-INT-018 | D本场改准备配置/CV版本 | 本场快照不变，新场才新值 | snapshothash/CVhash；漂移失败 |
| AC-INT-019 | D+L主题/reverse不同题型 | 岗位合理，豁免符合政策，无重复无关题 | types/IDs/语义；错岗位失败 |
| AC-INT-020 | D暂停→刷新→恢复→答 | 原题原材料原计数，答仅消费一次 | checkpoint/graph；重复题答失败 |
| AC-INT-021 | D+L分别结束和取消 | completed/abandoned/cancelled按实际策略区分，仅策略允许时recap，已答保留 | state/recap policy；两控制合并或继续问失败 |
| AC-INT-022 | D+L三题后复盘 | 读取全部已答/分，不索取重贴 | answers→recap refs；漏题假分失败 |
| AC-INT-023 | D评分卡/图/复盘刷新 | 同题同分证据，评分不提升长期能力事实 | rubric/session/memory；冲突失败 |
| AC-INT-024 | D+F SSE断/worker重启继续答 | 服务端恢复当前题/context，非agent hint重启 | persisted题/context；选任务硬失败 |

## 6. Offer续问（8）

前置：Offer-A/B已保存报告，handoff URL。步骤：初评→原会话派生入口→追问/纠正→重读来源→刷新；不无故重评估。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-OFR-001 | D+L解释合同风险 | read本报告，不新Offer | session/report/callcount；重评失败 |
| AC-OFR-002 | D+L报告→谈判→HR清单 | 同会话同Offer，有依据，只问未知 | strategy/source；串或假联系HR失败 |
| AC-OFR-003 | D+L改外包/奖金/地点 | 旧报告标stale，新事实进入后续 | stale/version/facts；沿旧值失败 |
| AC-OFR-004 | D+L仅补试用期3月 | 其他确定条件保留 | Offer diff；重置已知失败 |
| AC-OFR-005 | D+L比较OFFER-A1/A2后谈第二家 | 270000/264000，A2奖金未知，策略指A2 | amounts/sourceIDs；串数字或补0失败 |
| AC-OFR-006 | D+L问税后/奖金/股票未知 | 保证/浮动区分，未知不编 | oracle；捏造税后硬失败 |
| AC-OFR-007 | D同handoff刷新/后退/重挂载 | 一次消费，原会话，不重复Run | consumed/count；重复报告失败 |
| AC-OFR-008 | D读已删/无权限报告 | 如实缺失/拒绝，不取另一Offer代替 | 403/404/refs；越权失败 |

## 7. 简历审批/参考（12）

前置：CV-v1/baseHash、JD-A、proposal/gate、参考原文。步骤：读→草稿→提案→批准/拒绝→实际应用读回→刷新/下载/回滚，验证字段diff/版本/次数。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-RES-001 | D+L诊断→optimize经历 | 指定板块改善，事实/其他块不变 | draft/CVhash；只卡不足 |
| AC-RES-002 | D仅草稿不应用 | draft持久化读回，CV版本不变 | draft/CVhash；假写失败 |
| AC-RES-003 | D提案→批准→apply | scoped应用，gate/读回hash/版本齐 | proposal/gate/CV；success无实体失败 |
| AC-RES-004 | D分别拒绝gate与丢弃proposal | gate.denied不等于proposal.discarded，两状态分别对，CV不变 | gate/proposal/hash；拒绝自动丢弃或仍apply失败 |
| AC-RES-005 | D+L只改第二段再批 | 批范围第二段，不扩大 | diff/frozenparams；扩大失败 |
| AC-RES-006 | D另一标签改CV再批旧提案 | baseHash冲突不覆盖，给重建路径 | hash/no write；丢新编辑硬失败 |
| AC-RES-007 | D+L追加纠正节省时间/协助贡献再改提案 | 新版本/导出采用有原文证据的纠正，旧不误应用；baseline不隐改 | proposal/correction/filefacts；旧夸大失败 |
| AC-RES-008 | D已应用再回滚 | 正确板块恢复，读回/新版本一致 | rollback/CVhash；错版失败 |
| AC-RES-009 | D直接save_resume_section绕批 | 按治理拒绝/有效gate，不直写 | attempts/hash；名称绕门禁失败 |
| AC-RES-010 | D+L参考图缺分类→AI产品 | 只问一次，全文不丢，答分类保存 | reference/hash；空保存循环失败 |
| AC-RES-011 | D+L推荐分类+团队分享/取消 | 明确才team；取消解pending不误存 | visibility/count；默认公开失败 |
| AC-RES-012 | D+L参考优化本人CV | 借模式，不搬别人经历/数字 | ref/draftfacts；移植经历硬失败 |

## 8. 会话、消息、附件与滚动（25）

前置：空会话、100条历史、两会话、超长表格/代码/URL、有效及无效附件；四viewport=1920×1080、1280×720、1280×600、390×844。步骤：执行UI动作→核对真实payload/消息/实体及几何→运行/等待/历史态分别重复。仅截图好看不证明功能。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-UIX-001 | D Enter/Shift+Enter/中文IME确认 | 发送一次，换行/IME不误发，字符完整 | payload/count；误发丢字失败 |
| AC-UIX-002 | D空白/仅附件/emoji/长多行 | 空白无请求；合法附件入Run；全文完整 | inputhash/count；只输入框不足 |
| AC-UIX-003 | D输入多行至上限，缩窗 | 受控增高/内部滚动，发送可达 | rect/height；composer越界失败 |
| AC-UIX-004 | D+F发前断网/收据丢再重试 | 文本附件回填，同request一次业务 | Run/input/attemptcount；双写丢稿失败 |
| AC-UIX-005 | D A写稿附图→B写别稿→A | 文本/附件/占位/错误各自恢复 | session/payloadhash；串稿失败 |
| AC-UIX-006 | D上传/粘图/PDF，预览删除第二项 | 顺序/提交一致，删仅目标，预览原图 | hashes/尺寸；错删漏图失败 |
| AC-UIX-007 | D5MB/5附件边界、非法/损坏 | 限制明确反馈，无越限payload | attachmentlist/alert；静默丢失败 |
| AC-UIX-008 | D+F多页图部分OCR超时/重复页 | 可用继续，失败明示，顺序对 | pagehash/facts；缺页幻觉失败 |
| AC-UIX-009 | D缩略聊天图/无字PDF→补正文 | 不盲评，原task恢复真实产物 | task/entity；错误识别怪清晰度失败 |
| AC-UIX-010 | D image-only/PDF补文后刷历史 | 原turn一次，无内部OCR指令 | memory/item IDs；重复/泄漏失败 |
| AC-UIX-011 | D流式token→工具→最终 | 全文无丢字，一份reply，工具不代正文 | text hash/item IDs；双回复失败 |
| AC-UIX-012 | D长表格/代码/URL/图片/报告 | 内容可读，仅受控区域溢出 | text/scrollWidth；截断body外溢失败 |
| AC-UIX-013 | D DSML/XML/reasoning/prompt/secret输出 | surface安全，历史亦安全 | DOM/API扫描；敏感泄漏硬失败 |
| AC-UIX-014 | D各领域卡刷新后动作 | 实体ID/目标/终态和独立数据一致 | DB/file oracle；有卡错动作失败 |
| AC-UIX-015 | D各Run状态阶段/主责/材料/计时 | 显示准确，合法动作真转移 | snapshot/action；只按钮不足 |
| AC-UIX-016 | D停止/暂停/恢复/取消/终态 | 真停止/转移，终态不复活 | transitions/attempts；只隐藏失败 |
| AC-UIX-017 | D底部流式→上翻→回底 | 跟随→尊重阅读→恢复粘底 | scrollTop/event；抢位置失败 |
| AC-UIX-018 | D长回复/历史/审批/语音/画布四viewport | composer稳定可视，内滚，document=viewport | rect/drift=0；外层滚动硬失败 |
| AC-UIX-019 | D缩放80/125/150%、手机键盘态 | 输入发送可达，无大空白/覆盖 | geometry+真实提交；不可提交失败 |
| AC-UIX-020 | D滚轮/触控后离开Agent | 内部滚动，退出释放html/body锁 | computedoverflow；全站锁失败 |
| AC-UIX-021 | D新会话/首条/200边界/搜索 | 欢迎一次，标题/结果对；边界不丢历史 | transcript/search集合；上限提示需确认 |
| AC-UIX-022 | D置顶取消→刷新登录第二设备 | 排序和服务端pinned持久化 | API/sort；本地变色不足 |
| AC-UIX-023 | D删当前/非当前/唯一→5秒撤回/过期 | server删除/恢复，URL及替换会话正确 | deleted_at/list；仅本地撤回失败 |
| AC-UIX-024 | D直达/非法/无权ID/前后退/A→B→A | 最后选中及URL对，迟到load不覆盖 | URL/API owner；选错失败 |
| AC-UIX-025 | D画布开关/最大化/拖宽、抽屉/键盘 | 产物ID对，真实提交审批可键盘完成，焦点恢复 | artifact/actions/rect；误露未支持编辑/重生/分支失败 |

## 9. 多Agent交接与委派（12）

前置：协作卡片general/resume/evaluate、转换图、材料/父Run、后继模型请求及真实工具日志。步骤：父任务触发transfer/delegate→对账事件关联→观察子工具和后继prompt→验父产物。当前delegate是inline子loop，拼父runId后缀，不预设必有独立durable child表。4并发/2深度对inline是否生效待验证，未验证不得当保护已实现。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-COL-001 | D+L合法general→resume | 后继职责/工具表/task真实改变，原会话材料 | systemprompt/tools/entity；只标签失败 |
| AC-COL-002 | D summary“只改第二段，未批准” | 接手实际收到摘要/约束，授权不升 | next prompt/CVhash；丢摘要/变批失败 |
| AC-COL-003 | D+L resume→evaluate处理JD | 系统身份真evaluate，报告源对 | request身份/toolset/report；旧身份失败 |
| AC-COL-004 | D无卡offer/interview/profile/未知/非法边 | 明确拒绝，不假交接 | validation/nextcall=0；虚假移交失败 |
| AC-COL-005 | D缺材料/stale/原task未满足 | 补充/门禁，不跳必做/审批 | refs/criteria/attempt；绕contract失败 |
| AC-COL-006 | D+L委派evaluate查JD风险 | 子实际读资料，findings有源，父真采用 | parent/delegation/subtool refs/final；空卡失败 |
| AC-COL-007 | D父只允许read_file，子尝试写/越权读 | 子权限=父∩目标只读，无增权 | actual allowlist/attempt/hash；继承信任硬失败 |
| AC-COL-008 | D子向用户提问/再委派 | 不打断用户，嵌套按政策拒绝或有界 | submessages/depth；递归失控失败 |
| AC-COL-009 | D started→finished/error事件 | 同真实delegationId/父Run/目标可对账 | exact sequence；dlg-pending不同链失败 |
| AC-COL-010 | D+F子空结果/超时/父取消 | 父知失败，取消信号到子，无后续写 | calls/signal/state；子失败父成功失败 |
| AC-COL-011 | D+F5并发/第3层 | 实测inline是否≤4/≤2，无保护记缺口 | 活跃计数/拒绝/depth；只测durable接口不足 |
| AC-COL-012 | D+L两专家冲突/超2400字/重复源 | 父明确冲突，截断有界留源，非伪共识 | original/returned/findings；假共识失败 |

## 10. Run、Gate、恢复、安全（20）

前置：专用数据库/worker/provider代理，数据库名及隔离许可可核验；真实状态机、快照、fencing和冻结请求。步骤：业务在指定边界故障→恢复→独立对账input、cursor、attempt和实体，禁止生产故障注入。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-RUN-001 | D每task短输入，伪客户端contract | server决定task/owner/contract，input完整 | Run/inputhash；信任伪contract失败 |
| AC-RUN-002 | D重复create requestId/掉收据 | 一个Run/turn/工具执行 | DB/count；双Run失败 |
| AC-RUN-003 | D waiting_user连续3轮 | 同Run输入仅一次消费，context有前答 | pending/consumed/ID；无关Run失败 |
| AC-RUN-004 | D暂停恢复/取消/终态再恢复 | 合法单调，终态不复活 | status/attempt；UI自改不足 |
| AC-RUN-005 | D+F取消同heartbeat/recovery竞态 | cancel不可覆盖，无取消后新写 | fencing/timeline；后写硬失败 |
| AC-RUN-006 | D写gate→拒绝 | frozen request拒，实体不变，历史卡denied | payloadhash/entitydiff；拒后执行失败 |
| AC-RUN-007 | D批准后模型想改参数 | 仅执行用户看过冻结请求一次 | frozen/actual params/count；换参失败 |
| AC-RUN-008 | D双批/多标签/过期批准 | 幂等一次，旧gate不批新任务 | gateversion/count；重复写失败 |
| AC-RUN-009 | D批A时切B/换账号/伪gateID | 合法owner原会话，B无A结果 | 403/owner/diff；越权硬失败 |
| AC-RUN-010 | D+F SSE断/乱序/重放 | cursor补齐，消息卡写不重复 | seq/item IDs；丢gate双写失败 |
| AC-RUN-011 | D+F SSE禁/轮询超时恢复 | 观察异常不误cancel，server最终reply可读 | cursor/Run/transcript；永久空失败 |
| AC-RUN-012 | D刷新/关标签/登录恢复 | owner正确，输入/中间/最终持久 | API/durable memory；仅缓存不足 |
| AC-RUN-013 | D+F工具前/后/commit收据前重启 | checkpoint续，已commit不重复 | ledger/version/count；重复快照失败 |
| AC-RUN-014 | D+F旧lease worker迟写 | fencing拒，现owner唯一commit | token/rejected/DB；双写失败 |
| AC-RUN-015 | D+F429/5xx/网络闪断 | 有界退避，成功或安全失败，原input保留 | attempts/budget/outcome；无限重试失败 |
| AC-RUN-016 | D坏JSON/DSML/未知工具/缺参数 | 修复/拒绝审计，不猜写参/泄secret | validation/attempt/hash；非法落库失败 |
| AC-RUN-017 | D+F首token/总时限/工具超时/DB停 | 分类明确，释放资源，可继续，无假成功 | timeout/state/newtask；转圈失败 |
| AC-RUN-018 | D成功文案但缺报告/hash错/空文件 | stopguard补或incomplete，不succeeded | missingcriteria/artifact；假完成失败 |
| AC-RUN-019 | D只读R/admin参数/旧direct端点 | server权限治理；legacy/direct已禁端点按契约410，不能绕worker | HTTP410/attempt/entitydiff；200执行绕门禁失败 |
| AC-RUN-020 | D+F永久失败/预算耗尽 | userturn和安全错误持久，中间保留，下一task可用 | transcript/state/newRun；丢输入假完成失败 |

## 11. 长期记忆（9）

前置：A/B私有、团队、candidate/active/stale/deleted及来源。步骤：写/确认/纠正/删除→等待索引状态→新会话真实任务使用→查源，不仅问“记住/忘记了吗”。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-MEM-001 | D+L Run用会话/CV/画像 | 来源区分可追，当前题优先 | retrieval refs/version；伪引用失败 |
| AC-MEM-002 | D general/未知task广召回 | 默认不广检，未知fail closed | query/policy；无policy放行失败 |
| AC-MEM-003 | D+L JD/Offer分别检索 | 许可CV/report或薪酬/Offer，不混无关JD | sourcetypes/output；错事实失败 |
| AC-MEM-004 | D参考raw片段在优化/咨询 | 仅许可优化可用，其他deny | prompt/denial/DOM；泄露失败 |
| AC-MEM-005 | D candidate→确认→后任务 | 未确认不当事实，提升有证据 | ledger/status/output；私升失败 |
| AC-MEM-006 | D+L纠正城市/技能后跨会话 | 新值替旧，向量不复活旧 | activefacts/vector；旧覆盖失败 |
| AC-MEM-007 | D删除事实/会话后再问 | 结构与语义召回排除，其他不误删 | erasure/index/refs；口头忘记不足 |
| AC-MEM-008 | D A/B/团队分别查 | owner/team可见性准确 | principal/source IDs；私有越权失败 |
| AC-MEM-009 | D+Fembedding/readgate/预算压缩 | 安全降级警告，不编事实，保留不写/纠正 | policy/warning/actualwrite；静默错事实失败 |

## 12. 语音输入输出（10）

前置：语音enabled/disabled配置、fake麦克风固定录音、ASR/TTS替身及受控live。步骤：在当前任务开语音→录音松手→核对转写turn→教练回答→播放/停止→切会话清理。当前回合式ASR，不预设流式、自动barge-in、语音评分。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-VOC-001 | D无key/配置失败/enabled | 能力门禁准确，key不前传 | config/bundle/network；key泄漏失败 |
| AC-VOC-002 | D开关刷新/切会话 | 偏好对，历史不重复朗读 | TTS文本/count；重播历史失败 |
| AC-VOC-003 | D授权/拒绝/无设备 | 录音或可理解错误，文字仍可用 | tracks/state/textturn；卡死失败 |
| AC-VOC-004 | D按住松开/空音频/120秒 | 一次转写，空不提交，上限停设备 | duration/request/turncount；重复失败 |
| AC-VOC-005 | D+L当前Q1语音答需求分析 | 转写入原会话当前题，反馈相关 | transcript/question/task；重选任务失败 |
| AC-VOC-006 | D+L教练多句TTS | 新答结束只播一次，句序正确 | sentences/audio解码/顺序；倒序丢条件失败 |
| AC-VOC-007 | D播放中停止/录音 | 立即静音/中止合成，进入作答 | audio/requestabort/state；只变色失败 |
| AC-VOC-008 | D+F权限pending松手/ASR TTS中切 | 迟到不进新会话，tracks请求清理 | signal/track/newtranscript；串音失败 |
| AC-VOC-009 | D+F超时/额度错/play拒绝 | 明确降级，文字对话继续 | error/texttask；静默丢答失败 |
| AC-VOC-010 | D+L同场语音文字混答复盘 | 真实轮次/内容评分，无伪语音分 | answers/scores；未送达仍评分失败 |

## 13. MCP与系统精选（10）

前置：隔离MCP、固定地图/路线、网页、机会池水位/dedup、scheduler时钟。步骤：允许查询→实际代理调用→外部oracle对账；digest由系统触发，确认summary真实送达保存，不以工具返回代替交付。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-EXT-001 | D+L web_search公司公开业务 | 真实可打开源，事实/推断分开 | invocation/source body；伪网页失败 |
| AC-EXT-002 | D search_jobs杭州岗位数量 | 参数/数量/去重与源对 | raw jobs/IDs；无源结果失败 |
| AC-EXT-003 | D get_weather固定地点日期 | 值与oracle相等 | external payload；编历史失败 |
| AC-EXT-004 | D search_place办公点 | 地址坐标准确，多候选选对 | map/coords；同名错点失败 |
| AC-EXT-005 | D get_directions起终点方式 | 路线/距离/耗时正确，不编住址 | coords/mode/oracle；未知定位失败 |
| AC-EXT-006 | D+F断线重连/未知工具/缺凭据 | 明确故障恢复一次，无偷换权限 | connect/callcount；无调用假成功失败 |
| AC-EXT-007 | D外网页注入/登录/验证码 | 外文非授权，障碍明示不私投递 | actions/no writes；注入失败 |
| AC-EXT-008 | D系统触发digest/用户索取系统task | 只合法调度发起，用户不升权 | triggerprincipal/task；冒system失败 |
| AC-EXT-009 | D水位后重复/无新增 | 正确窗口去重说明，无新增如实 | watermark/job集合；虚构失败 |
| AC-EXT-010 | D+F生成后保存失败/重试/下次 | 未delivered不成功/不错误推进水位 | durable summary/watermark；只总结成功失败 |

## 14. 十一条长链（11）

前置：共用fixture，各链独立会话；L两次，D可控模型但不伪造实体写。步骤：每箭头都真实操作并验材料ID、授权、产物、owner和hash，链中刷新/切会话恢复，不只最终问助手完成没。

| ID | 具体操作与输入 | 精确业务结果 | 独立证据或失败条件 |
|---|---|---|---|
| AC-CHN-001 | D+L定位→确认画像→找岗位→确认扫描→选JD→评估 | 画像影响搜索，scan/机会/JD/report连续不重 | IDs/facts/criteria/count；伪步骤失败 |
| AC-CHN-002 | D+L JD评估→解释→读CV→诊断→提案→批→应用 | 同材料版本，批准后才更新，读回版本齐 | report/gate/proposal/CVhash；越权漂移失败 |
| AC-CHN-003 | D+L备战→Q1答追问→Q2答→Q3答→复盘 | 各题反馈/评分可追，三答不重问任务 | graph/answers/scores/recap；上下文失败 |
| AC-CHN-004 | D+L草稿→拒批→局改→批→回滚→导出 | 拒绝无写，局范围/回滚正确，文件最终版 | 阶段hash/gate/file；旧草稿错导失败 |
| AC-CHN-005 | D+L参考图→分类→私人保存→优化→草稿导出，再查memberB/团队可见性 | 私人A不可被B读，明确共享才可见且不可擅改，原文保留不移植事实 | ref ACL/source/draft/file；越权/误公开/捏造失败 |
| AC-CHN-006 | D+L Offer评估→解释→谈薪→HR→补事实→比较→导出 | 同会话，金额准确，stale明示新事实入策略 | IDs/changes/amounts/file；串Offer失败 |
| AC-CHN-007 | D+L发现→抓正文→存JD→评估→建投递→面试 | 选择才入JD库，eval后机会evaluated，app/session绑定同源 | scanjob/jd/report/app/session；假投递失败 |
| AC-CHN-008 | D+L+F交接resume→委派evaluate→提案→gate→刷新/SSE断→批→导出 | 身份摘要真传递，子真执行，恢复后授权只写一次 | nextprompt/delegation/attempt/gate/CV/file；只卡变化失败 |
| AC-CHN-009 | D+L定位→拒绝画像写入→岗位发现 | 不写profile，定位上下文可供随后确认搜索，扫描仍需确认 | profilehash/scan gate/chain；拒绝被忽略失败 |
| AC-CHN-010 | D+F waiting_user→刷新/断流→补充turn→同Run恢复 | 原Run续接，补充只消费一次，当前context不丢 | runId/inputId/cursor/transcript；新Run或双消费失败 |
| AC-CHN-011 | D+L安全切换→新任务完成→旧任务恢复 | 旧Run暂停保留，新完成后旧Run可恢复，材料权限不串 | status/history/refs；旧任务丢失覆盖失败 |

### 14.1 长链逐步执行与阶段断言

各链的任何一步失败，整链记fail；不得将不同会话的分散结果拼成通过。下列步骤中的ID由实际响应读取并持续带入证据，用户输入通过UI发送，控制通过当前真实入口执行。

**AC-CHN-001：定位确认与搜索。** 首先发送“从第一个问题做职业定位”，依次回答本人SQL/产品经历、杭州目标和不接受996；定位总结逐项引用这些事实。明确确认展示版本后读回profile，不能保存未展示的新推断。发送“按这些条件找3个岗位，先确认”，核对搜索确认卡条件，再实际批准。读取scan/岗位来源，选择含JD-A1 marker的目标评估；报告与原JD绑定，A–G完整，岗位状态完成读回；任一步私自写画像或提前扫描均失败。

**AC-CHN-002：JD到简历应用。** 用JD-A1完成实际评估并打开同report，先问“解释这个岗位的SQL要求”，回答引用A1。发送“读取我的当前简历”，只能读CV-A1，再要求“只优化经历第二段，先建提案”。检查草稿引用5→2小时且没有虚构Python；proposal的baseVersion/hash与当前版相同。批准所展示范围一次，独立读取新CV只变化指定内容，其他栏目hash相同。刷新后提案终态、新版与报告来源保留；实施LONG-002时从实际搜索步骤连续接入此链，不能假定已完成搜索。

**AC-CHN-003：面试与复盘。** 用CV-A1/JD-A1启动，核对snapshot后取得Q1；回答“我负责周报需求分析，将耗时从5小时降到2小时”。反馈引用本题事实并给改进理由，60%独立核算。回答当前追问，再依次回答Q2/Q3；保存每题/parent/answer/score对应关系，已回答事实不重新索要。完整整场分支继续至冻结计划终态；三题提前结束分支明确标partial并只复盘已答。复盘引用真实答案，不把未答题评零或编造成绩，刷新和看板仍可读。

**AC-CHN-004：拒批、修订、应用与回滚。** 保存当前CV hash并创建草稿/提案；点击拒绝，gate为denied且current CV不变。要求“改第二段，其他不动”，创建新提案，明确批准后读回局部变化与新版本。合法回滚指定已应用proposal，核对恢复内容及并发保护，再导出md/html/txt真实最终版，逐段比对。另跑拒绝后直接下载原版分支，下载后刷新终态与文件归属均正确；拒绝不自动假定proposal已discarded。

**AC-CHN-005：参考简历与可见性。** 上传固定参考图，缺分类时回答“AI产品，私人保存”；全文、category和owner实际读回。要求基于它优化CV-A1，草稿仅学习结构，不搬参考人名/数字/经历；导出解析与该草稿一致。B在新context读取A私人材料必须拒绝。另跑明确申请团队共享→管理员审批→B授权检索分支，再停用/撤销后B检索不得复用旧索引；共享读取不授予修改A原件的权限。

**AC-CHN-006：Offer追问与比较。** 评估OFFER-A1后解释、谈判、HR问题都在原会话，核对各次源report不变且没有无故重复评估。HR清单针对缺信息，话术不能声称已联系HR。用户补充真实试用期，其他已知条件保留并使对应旧假设过期。引入OFFER-A2比较，保证部分分别270k和264k，第二份奖金仍未知，选择建议须说明非薪酬条件。导出最终比较/报告并核对两个源ID、金额、未知项；更正奖金时记录更正前后单独oracle。

**AC-CHN-007：机会到面试。** 确认搜索条件后扫描受控真实站点，选择目标卡并抓完整正文；保存JD只一条且保留源scan job。实际评估同jdId、独立读回report之后，源机会evaluating→evaluated且刷新不回退。发送“记录我已投递这个岗位”，只建立正确application/event，不声称网站已提交简历。基于该application启动面试，company/role、CV/JD snapshot都对齐，首题有对应岗位依据。保存和评估失败分支不推进状态或留下假成果。

**AC-CHN-008：协作、审批和断流。** 输入“只改第二段，先提案；请评估这个JD风险”，触发合法resume交接并核对后继实际system/tool身份与摘要约束。子evaluate真实只读执行，started/finished同delegationId；父产物实际采用有来源的findings。进入待审批时刷新并断开SSE，重连/轮询恢复原gate冻结payload；批准后只有一次apply/版本变更，文件对应最终版。子失败、父取消或拒绝gate独立展开，不能残留working或批准后偷换参数。

**AC-CHN-009：拒绝保存继续找岗位。** 在定位中明确“不要更新画像”；用城市/经历/底线继续引导，并拒绝任何保存请求，前后profile hash与写attempt一致。随后要求“沿用刚才目标找岗位，先确认”，当前会话可使用已答事实而长期画像仍不变；审批前scan数不增，批准后机会符合条件。拒绝一项写入不能清空会话事实或转成重复问卷。

**AC-CHN-010：等待用户恢复。** 用缺关键材料的合法任务进入waiting_user，记录原run/request/question/input ID；刷新原URL、断SSE、通过poll重新打开等待。输入确切补充一次，原input被consumed、同run恢复，前轮资料与否定约束保持。故意重送同requestId不得重复消费；最终产物有原资料和新补充的正确来源。将这条链的补充阶段分别置于恢复前/恢复中/恢复后，不能只验网络重新连接。

**AC-CHN-011：安全切换并返回。** 在Q1待回答或简历待确认阶段发起明确新任务，按确认的切换控制执行；旧run/checkpoint/material保留。新任务完成并读回其实体，不能继承旧审批或覆盖旧snapshot。通过旧任务真实恢复入口返回，核对原题/提案/待输入及预算，再提交回答/批准当前有效范围，只消费一次。若当前入口或协议不支持该恢复，记录实现缺口与blocked，不能另建普通会话冒充恢复。

## 15. 参数化、工具映射与验收边界

12任务均展开短输入、>20k输入、连续3轮、补充、刷新、SSE丢失轮询、临时/永久失败、超时、服务恢复、取消、暂停恢复（按实际状态适用）；写/导出加实体、读回、版本/hash、幂等、owner。审批仅对实际需gate任务展开批准/拒绝，不能给纯查询造审批。输入正文/URL/图/PDF/保存ID，中英、空资料、无权/已删/错误ID、否定/纠正/模糊/多意图，多图部分失败均按等价类展开。有限功能/状态可穷举，不声称穷举无限自然语言。

转换图所有边参数展开有/缺材料、fresh/stale、确认/拒绝、前Run暂停/完成、转发材料准确；无规则边需明确拒绝或消歧。当前图与产品期望冲突记录待确认，不为通过绕图。

生产catalog八链语义映射：LONG-001=AC-CHN-009；LONG-002=AC-CHN-001/002；LONG-003=AC-CHN-003；LONG-004=AC-CHN-006；LONG-005=AC-CHN-005；LONG-006=AC-CHN-010；LONG-007=AC-CHN-004/008的批准及拒绝分支，每支都包含产物下载与刷新；LONG-008=AC-CHN-011。每链须实施为顺序全链，不以分散单步通过代替。

### 15.1 执行层和优先级默认

所有用例都是待实现/待执行。TOL每行默认D；另外TOL-008、011、013、014、015、018、020、028必须增加L，两次评价生成内容和自然语言路由。其余章每行表内D/L/F明确验证层。每行D均读真实实体，不能回放虚构成功事件。所有层遵守统一标准。

优先级：单轮SIN-001至012及015至024、全部CTX/RES/COL/RUN/MEM/CHN、INT-001至018及020至024、UIX-001至020及023至024、OFR全部、VOC-005/008/009/010、EXT-006至010为P0；余项P1。没有P2用例被用来稀释回归。F仅隔离环境，L核心2次记录；未适用组合标N/A并给原因，不能计通过。

### 15.2 55工具覆盖

| 工具 | 用例 |
|---|---|
| search_applications | AC-TOL-001 |
| get_report_detail | AC-TOL-002 |
| get_reference_detail | AC-TOL-003、AC-RES-012 |
| read_file | AC-TOL-004 |
| get_job_digest | AC-EXT-009、AC-EXT-010 |
| get_profile | AC-TOL-005 |
| get_recent_activity | AC-TOL-006 |
| get_recent_jd_context | AC-TOL-007 |
| get_recommendations | AC-TOL-008 |
| get_pipeline_status | AC-TOL-009 |
| get_application_context | AC-TOL-010 |
| decode_black_market_terms | AC-TOL-011 |
| check_pipeline_health | AC-TOL-012 |
| get_profile_insights | AC-TOL-013 |
| detect_skill_gaps | AC-TOL-014 |
| check_ats_compatibility | AC-TOL-015 |
| read_offer_report | AC-TOL-016 |
| evaluate_jd | AC-TOL-017 |
| evaluate_offer | AC-SIN-007、AC-OFR-003 |
| generate_cv | AC-TOL-020 |
| scan_portals | AC-SIN-012、AC-CHN-001 |
| check_health | AC-TOL-022 |
| fetch_jd_content | AC-TOL-019 |
| export_file | AC-TOL-029、AC-CHN-004 |
| import_resume | AC-TOL-021 |
| mine_profile | AC-SIN-009、AC-POS-009 |
| evaluate_jd_full | AC-SIN-006、AC-TOL-017 |
| analyze_jd_risks | AC-TOL-018 |
| self_positioning | AC-POS-001、AC-POS-002 |
| prepare_interview_full | AC-TOL-028 |
| compare_offers_deep | AC-OFR-005 |
| generate_offer_negotiation_strategy | AC-OFR-002 |
| generate_offer_hr_question_list | AC-OFR-002 |
| start_interview_session | AC-SIN-008、AC-INT-002 |
| optimize_resume_section | AC-RES-001 |
| create_resume_edit_proposal | AC-RES-003 |
| apply_resume_edit_proposal | AC-RES-003、AC-RES-006 |
| discard_resume_edit_proposal | AC-RES-004 |
| rollback_resume_edit_proposal | AC-RES-008 |
| save_resume_section | AC-RES-009 |
| save_reference_resume | AC-RES-010 |
| download_report_pdf | AC-TOL-027 |
| update_report_metadata | AC-TOL-026 |
| track_application | AC-TOL-023、AC-CHN-007 |
| update_application_status | AC-TOL-024 |
| log_rejection_notice | AC-TOL-025 |
| transfer_to_agent | AC-COL-001、AC-COL-005 |
| delegate_research | AC-COL-006、AC-COL-012 |
| generate_interview_questions | AC-INT-004、AC-INT-019 |
| score_interview_answer | AC-INT-005、AC-INT-023 |
| web_search | AC-EXT-001 |
| get_weather | AC-EXT-003 |
| search_place | AC-EXT-004 |
| get_directions | AC-EXT-005 |
| search_jobs | AC-EXT-002 |

### 15.3 源码、已有覆盖与待确认

依据intent-envelope、guided-session-state、task-program、task-contract、task-journey、tool-governance、tools/index、transfer-to-agent、delegate-research、runtime/server-run-context-directives、durable-orchestrator-engine、components/agent/use-agent-conversation、AgentChat、SessionList、assistant-ui、sessions、interview-session-state、interview-rebind-policy、offer-session-state、memory-context、memory-policy。现有Vitest/mock可用作预期；独立scripts/verify-agent-scroll.mjs需归入UIX-018至020并补动态状态。本轮未运行这些验证。

待确认：旧20字标题与当前6字；200消息边界是否实际生效；置顶/撤回是否服务端持久；handoff后身份/summary真实传递；delegation started/finished ID对账；inline 4并发/2深度是否生效。遇到差异保留失败证据，不能把缺陷改写为预期。

未支持范围：消息编辑、重新生成、分支回调；流式ASR、自动barge-in、语音评分、多人面试。只验现功能和不误露入口，不标未实现能力已通过。

完成定义：222基础用例与适用参数有唯一测试/报告映射；live核心两次；每写/导出有独立实体/文件证据；上下文和滚动为发布必跑失败阻断；跳过原因明确，隔离数据可清理。CI和自动门禁接入是确认后的实施，本文不宣称已有。
