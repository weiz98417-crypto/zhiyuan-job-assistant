import type { AgentTaskType } from "@/lib/agent/task-contract";

export interface ProductionBrowserEvalCase {
  id: string;
  name: string;
  route: string;
  taskType?: AgentTaskType;
}

export interface ProductionBrowserEvalDomain {
  id: string;
  name: string;
  existingEvalDocument: string;
  cases: readonly ProductionBrowserEvalCase[];
}

function browserCase(
  id: string,
  name: string,
  route: string,
  taskType?: AgentTaskType,
): ProductionBrowserEvalCase {
  return { id, name, route, taskType };
}

function domain(
  id: string,
  name: string,
  existingEvalDocument: string,
  cases: readonly ProductionBrowserEvalCase[],
): ProductionBrowserEvalDomain {
  return { id, name, existingEvalDocument, cases };
}

export const PRODUCTION_BROWSER_EVAL_DOMAINS: readonly ProductionBrowserEvalDomain[] = [
  domain("F01", "认证准入、用户管理与数据隔离", "01-认证准入用户管理与数据隔离系统-Evals.md", [
    browserCase("AUTH-001", "注册后的 pending 用户不能进入业务页", "/register"),
    browserCase("AUTH-002", "管理员批准后登录、刷新和退出", "/login"),
    browserCase("AUTH-003", "两个用户的简历、会话、报告完全隔离", "/agent"),
  ]),
  domain("F02", "首页求职工作台", "02-首页求职工作台-Evals.md", [
    browserCase("HOME-001", "首次进入的空态和行动入口", "/"),
    browserCase("HOME-002", "有简历、报告、扫描后的摘要与跳转", "/"),
    browserCase("HOME-003", "局部数据源失败时首页安全收口", "/"),
  ]),
  domain("F03", "全局导航与应用外壳", "03-全局导航与应用外壳-Evals.md", [
    browserCase("NAV-001", "桌面导航、后退前进和当前态", "/"),
    browserCase("NAV-002", "移动端菜单、长标题和内容溢出", "/agent"),
    browserCase("NAV-003", "跨页面返回 Agent 保留会话", "/agent"),
  ]),
  domain("F04", "Agent Chat 会话状态与前端呈现", "04-Agent Chat会话状态与前端呈现系统-Evals.md", [
    browserCase("CHAT-001", "新建、置顶、切换、删除和恢复会话", "/agent"),
    browserCase("CHAT-002", "长中文材料、Markdown、三轮普通对话与刷新", "/agent", "general_chat"),
    browserCase("CHAT-003", "活动 Run、过程轨道与 SSE 补齐", "/agent"),
  ]),
  domain("F05", "图片识别与截图路由", "05-图片识别与截图路由系统-Evals.md", [
    browserCase("IMAGE-001", "JD 截图进入 JD 评估", "/agent", "jd_evaluation"),
    browserCase("IMAGE-002", "Offer 截图进入 Offer 评估", "/agent", "offer_evaluation"),
    browserCase("IMAGE-003", "简历截图只产生待批准提案", "/agent", "resume_edit"),
  ]),
  domain("F06", "Agent 路由任务契约与子 Agent 编排", "06-Agent路由任务契约与子Agent编排系统-Evals.md", [
    browserCase("ROUTE-001", "简历只读查询不触发修改", "/agent", "resume_query"),
    browserCase("ROUTE-002", "职业定位的否定写入约束不覆盖主目标", "/agent", "career_positioning_guidance"),
    browserCase("ROUTE-003", "模糊续跑和明确任务安全切换", "/agent"),
  ]),
  domain("F07", "Agent 工具治理与读回校验", "07-Agent工具治理与读回校验-Evals.md", [
    browserCase("GOV-001", "只读任务不能绕过策略写入", "/agent"),
    browserCase("GOV-002", "高风险 Gate 双击、刷新后仍只执行一次", "/agent"),
    browserCase("GOV-003", "读回失败不能声称成功", "/agent"),
  ]),
  domain("F08", "纸鸢求职助手评分系统", "08-纸鸢求职助手评分系统-Evals.md", [
    browserCase("SCORE-001", "简历评分的维度、依据和空态", "/cv"),
    browserCase("SCORE-002", "ATS 和技能差距不自动改写简历", "/cv"),
    browserCase("SCORE-003", "版本切换后的评分输入正确", "/cv"),
  ]),
  domain("F09", "岗位发现扫描系统", "09-岗位发现扫描系统-Evals.md", [
    browserCase("SCAN-001", "条件澄清、确认后才创建扫描", "/discover"),
    browserCase("SCAN-002", "职位卡、原 JD、去重和详情", "/discover"),
    browserCase("SCAN-003", "扫描失败、取消和历史读回", "/discover"),
  ]),
  domain("F10", "投递追踪系统", "10-投递追踪系统-Evals.md", [
    browserCase("TRACK-001", "从职位或报告创建投递", "/tracker"),
    browserCase("TRACK-002", "阶段、备注、筛选和刷新", "/tracker"),
    browserCase("TRACK-003", "空态和跨用户隔离", "/tracker"),
  ]),
  domain("F11", "简历工作台与版本管理", "11-简历工作台与版本管理系统-Evals.md", [
    browserCase("CV-001", "文本、DOCX、PDF 导入与解析失败", "/cv"),
    browserCase("CV-002", "版本创建、切换、刷新和 Agent 读回", "/cv"),
    browserCase("CV-003", "优化、量化、JD 定制只创建草稿", "/cv"),
  ]),
  domain("F12", "简历修改提案与回滚", "12-简历修改提案与回滚系统-Evals.md", [
    browserCase("PROPOSAL-001", "Agent 指定区块草稿和提案详情", "/agent", "resume_edit"),
    browserCase("PROPOSAL-002", "批准、应用、读回和版本快照", "/agent", "resume_edit"),
    browserCase("PROPOSAL-003", "拒绝、丢弃、回滚不误写", "/cv"),
  ]),
  domain("F13", "简历优化 Judge 引擎", "13-简历优化Judge引擎-Evals.md", [
    browserCase("JUDGE-001", "质量和占位符检测", "/cv"),
    browserCase("JUDGE-002", "不合格提案不能应用", "/cv"),
    browserCase("JUDGE-003", "相同输入评分可复盘", "/cv"),
  ]),
  domain("F14", "优秀简历记忆", "14-优秀简历记忆系统-Evals.md", [
    browserCase("REF-001", "岗位、可见性确认和批准保存", "/agent", "reference_resume_save"),
    browserCase("REF-002", "拒绝 Gate 后刷新卡片终态", "/agent", "reference_resume_save"),
    browserCase("REF-003", "private/team 可见性和管理员审核", "/cv"),
  ]),
  domain("F15", "求职画像系统", "15-求职画像系统-Evals.md", [
    browserCase("PROFILE-001", "职业定位三轮连续推进", "/agent", "career_positioning_guidance"),
    browserCase("PROFILE-002", "画像信号确认、写入和读回", "/agent", "profile_update"),
    browserCase("PROFILE-003", "拒绝画像写入仍能继续指导", "/agent"),
  ]),
  domain("F16", "面试教练故事库与复盘", "16-面试教练故事库与复盘系统-Evals.md", [
    browserCase("INTERVIEW-001", "简历和 JD 绑定后生成第一题", "/interview", "interview_coaching"),
    browserCase("INTERVIEW-002", "回答后的反馈、题号推进与刷新", "/agent", "interview_coaching"),
    browserCase("INTERVIEW-003", "回答中的 JD 关键词不劫持面试任务", "/agent", "interview_coaching"),
  ]),
  domain("F17", "Offer 评估与对比", "17-Offer评估与对比系统-Evals.md", [
    browserCase("OFFER-001", "文本、链接、图片 Offer 的结构化评估", "/agent", "offer_evaluation"),
    browserCase("OFFER-002", "两份 Offer 的对比和来源跳转", "/compare"),
    browserCase("OFFER-003", "解释、谈判、HR 问询保持同会话", "/agent"),
  ]),
  domain("F18", "Analytics 求职数据分析", "18-Analytics求职数据分析系统-Evals.md", [
    browserCase("ANALYTICS-001", "时间范围筛选与聚合指标", "/analytics"),
    browserCase("ANALYTICS-002", "公司/行业资讯的空态和错误态", "/explore"),
    browserCase("ANALYTICS-003", "指标到来源记录的跳转", "/analytics"),
  ]),
  domain("F19", "个人设置与数据管理", "19-个人设置与数据管理系统-Evals.md", [
    browserCase("SETTINGS-001", "偏好保存、刷新和 Agent 生效", "/settings"),
    browserCase("SETTINGS-002", "修改密码后新旧凭据和会话策略", "/change-password"),
    browserCase("SETTINGS-003", "数据动作的取消和确认边界", "/settings"),
  ]),
  domain("F20", "文件导出与 PDF 生成", "20-文件导出与PDF生成系统-Evals.md", [
    browserCase("EXPORT-001", "简历 PDF 导出、下载、非零大小和 hash", "/cv", "file_export"),
    browserCase("EXPORT-002", "当前 JD/报告导出而非错用户旧报告", "/evaluate/reports", "file_export"),
    browserCase("EXPORT-003", "失败不能伪造下载成功", "/cv"),
  ]),
  domain("F21", "后台运营治理与团队质量", "21-后台运营治理与团队质量系统-Evals.md", [
    browserCase("ADMIN-001", "普通用户不能访问后台", "/admin/users"),
    browserCase("ADMIN-002", "管理员审批用户和重置密码", "/admin/users"),
    browserCase("ADMIN-003", "后台筛选、分页、详情和刷新", "/admin/agent-runs"),
  ]),
  domain("F22", "Agent Run 证据 Review 与 Eval 候选治理", "22-Agent Run证据Review与Eval候选治理系统-Evals.md", [
    browserCase("EVIDENCE-001", "用户卡片和管理员证据终态一致", "/agent"),
    browserCase("EVIDENCE-002", "失败 Run 创建 Eval 候选与审核", "/admin/agent-reviews"),
    browserCase("EVIDENCE-003", "暂停、恢复、取消完整呈现", "/admin/agent-runs"),
  ]),
  domain("F23", "PostgreSQL 与 pgvector 数据层", "23-PostgreSQL与pgvector数据层-Evals.md", [
    browserCase("DATA-001", "页面写入对应只读数据库证据", "/agent"),
    browserCase("DATA-002", "刷新和双浏览器上下文一致", "/agent"),
    browserCase("DATA-003", "向量检索遵守 private/team ACL", "/cv"),
  ]),
  domain("F24", "MCP 外部连接器", "24-MCP外部连接器系统-Evals.md", [
    browserCase("MCP-001", "允许调用展示安全中文摘要", "/agent"),
    browserCase("MCP-002", "未配置或超时连接器的可恢复失败", "/agent"),
    browserCase("MCP-003", "连接器不能绕过权限和工具治理", "/agent"),
  ]),
  domain("F25", "工程变更治理与自动化优化 Loop", "25-工程变更治理与自动化优化Loop系统-Evals.md", [
    browserCase("CHANGE-001", "发布版本、特性开关和证据可观察", "/admin/agent-runs"),
    browserCase("CHANGE-002", "线上失败进入回放候选", "/admin/agent-reviews"),
    browserCase("CHANGE-003", "发布后 web、worker、队列健康检查", "/login"),
  ]),
  domain("F26", "用户注入防范与内容安全", "26-用户注入防范与内容安全系统-Evals.md", [
    browserCase("SECURITY-001", "材料内提示注入不能改变权限", "/agent"),
    browserCase("SECURITY-002", "敏感字段和 raw payload 不出现在聊天", "/agent"),
    browserCase("SECURITY-003", "未知、过大、伪装文件安全失败", "/agent"),
  ]),
  domain("F27", "岗位发现 Agent 化", "27-岗位发现Agent化实施任务与Evals.md", [
    browserCase("JOB-AGENT-001", "对话条件收集、确认卡和扫描", "/agent", "job_search"),
    browserCase("JOB-AGENT-002", "扫描结果以可展开 JD 卡片流式出现", "/agent", "job_search"),
    browserCase("JOB-AGENT-003", "职位卡接力到 JD 评估和投递", "/agent"),
  ]),
  domain("F28", "Durable Agent Run 与自恢复运行时", "28-Durable-Agent-Run与自恢复运行时-Evals.md", [
    browserCase("RUN-001", "waiting_user 补充后同 Run 续跑", "/agent"),
    browserCase("RUN-002", "Gate 批准、拒绝和刷新终态一致", "/agent"),
    browserCase("RUN-003", "暂停、恢复、取消和 worker 恢复", "/agent"),
  ]),
];

export const CRITICAL_CROSS_TASK_BROWSER_JOURNEYS: readonly ProductionBrowserEvalCase[] = [
  browserCase("LONG-001", "职业定位 → 拒绝画像写入 → 岗位发现", "/agent"),
  browserCase("LONG-002", "岗位发现 → JD 评估 → 简历查询 → 提案 → 批准读回", "/agent"),
  browserCase("LONG-003", "JD 评估 → 面试辅导 → 回答反馈 → 复盘", "/agent"),
  browserCase("LONG-004", "Offer 评估 → 解释 → 谈判 → HR 问询", "/agent"),
  browserCase("LONG-005", "参考简历保存 → 检索优化 → 可见性边界", "/agent"),
  browserCase("LONG-006", "等待用户 → 刷新/断流 → 补充 Turn → 同 Run 恢复", "/agent"),
  browserCase("LONG-007", "高风险 Gate → 批准/拒绝 → Artifact 下载 → 刷新", "/agent"),
  browserCase("LONG-008", "任务安全切换 → 新任务完成 → 旧任务恢复", "/agent"),
];

export const AGENT_TASK_TYPES_REQUIRING_BROWSER_SHORT_JOURNEYS: readonly AgentTaskType[] = [
  "general_chat",
  "career_positioning_guidance",
  "resume_query",
  "resume_edit",
  "jd_evaluation",
  "offer_evaluation",
  "interview_coaching",
  "profile_update",
  "reference_resume_save",
  "file_export",
  "job_search",
];
