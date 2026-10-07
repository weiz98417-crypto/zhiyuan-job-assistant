export type ReleaseNote = {
  version: string;
  stage: "production" | "development";
  summary: string;
  sections: {
    title: string;
    changes: { title?: string; description: string }[];
  }[];
  caveat?: string;
};

export const releaseNotes: ReleaseNote[] = [
  {
    version: "0.13.0",
    stage: "production",
    summary: "10 月能力升级：语音面试、可信度门禁、题库与薪资基准、岗位精选和 Agent 运行可观测性。",
    sections: [
      {
        title: "语音面试",
        changes: [
          { description: "面试教练支持按住说话、MiMo ASR 转写和 MiMo TTS 逐句朗读，语音模式可在所有 Agent 会话中使用。" },
          { description: "语音密钥仅由服务端读取，前端不暴露供应商凭据；播放中可停止，录音和播放状态相互独立。" },
        ],
      },
      {
        title: "可信度与评估",
        changes: [
          { description: "简历生成增加事实来源和忠实度门禁，ATS 与 PDF 视觉检查纳入发布前验证。" },
          { description: "面试评分显示证据引用和三态结论，题库、薪资来源和岗位精选结果保留可追溯依据。" },
        ],
      },
      {
        title: "运行体验",
        changes: [
          { description: "统一工作台原语和浮层，补齐 Agent 调用追踪、token 成本、浏览器工具治理与 MCP 重连。" },
          { description: "导出链路和依赖完成收敛，保留生产门禁、数据库迁移和 Worker 发布前检查。" },
        ],
      },
    ],
  },
  {
    version: "0.12.2",
    stage: "production",
    summary: "9 月 30 日补丁：执行态布局、对话可读性、简历草稿完成条件和记忆回写修复。",
    sections: [
      {
        title: "执行态布局",
        changes: [
          { description: "修复窄屏工作台横向错排：移动顶部栏改为占满宽度，正文不再被挤到右侧并留下半屏空白。" },
          { description: "阶段进度、Agent 交接标签和暂停/取消控制在小屏自动换行，桌面双栏旅程栏保持不变。" },
        ],
      },
      {
        title: "对话可读性",
        changes: [
          { description: "助手回复增加低透明度暖色纸张层、细边界和轻阴影，保留品牌底图层次并提升正文对比度。" },
          { description: "新增窄屏执行态与底图对比度回归 eval，避免布局和可读性问题再次回退。" },
        ],
      },
      {
        title: "任务完成与记忆",
        changes: [
          { description: "明确只生成简历建议或草稿时，以草稿持久化和读回为完成条件，不再要求批准、应用或新增简历版本；应用修改仍需要用户批准。" },
          { description: "任务未完成时使用清晰的中文提示，不再把内部英文判据直接展示给用户。" },
          { description: "修复记忆清除抑制查询的 PostgreSQL bigint/text 类型冲突，避免 JD 分析后的记忆回写报错。" },
          { description: "新增生产事故 eval、只读 Event/Checkpoint 投影核验和测试数据清理证据；候选版本验收结果以实际生产测试报告为准。" },
        ],
      },
    ],
  },
  {
    version: "0.12.1",
    stage: "production",
    summary: "9 月 29 日补丁：品牌上线与生产对话稳定性修复。",
    sections: [
      {
        title: "品牌与登录",
        changes: [
          { description: "可见品牌统一为“纸鸢 Agent”，登录页与工作台接入透明 Logo、品牌色与深色变体。" },
          { description: "本地登录兼容 localhost、127.0.0.1 和 ::1 的回环来源；生产环境继续严格匹配 APP_ORIGIN。" },
          { description: "线上 release 与 Git 提交重新对齐，登录页品牌资源、Web 和 Agent Worker 一起更新。" },
          { description: "发布前增加同源与跨源登录验收，避免合法登录再次显示“Request origin is not allowed”。" },
        ],
      },
      {
        title: "对话修复",
        changes: [
          { description: "修复对话消息对账：一次发送只显示一个用户气泡，真实的连续两次发送仍分别保留。" },
          { description: "修复普通对话无回复：Worker 继承共享模型配置，失败或无正文时给出明确提示。" },
        ],
      },
      {
        title: "版本记录",
        changes: [
          { description: "版本更新页可选择历史版本，查看该版本的详细记录；刷新或使用浏览器前进、后退时保留选择。" },
          { description: "开发整合阶段与资料不完整的旧版本分别标明，避免把未发布内容或未经核实的变更当成生产发布。" },
        ],
      },
    ],
  },
  {
    version: "0.12.0",
    stage: "production",
    summary: "双面板工作台与 Agent 任务轨道，以及 0.12.0 期间的后续修复。",
    sections: [
      {
        title: "0.12.0 后续修复",
        changes: [
          { description: "Agent 的普通对话回复会显示在当前会话，重开历史会话也能读回已保存的回复和图片。" },
          { description: "已保存简历中的工作经历与项目经历可准确分栏，后续导入会保留原文并检查内容完整性。" },
          { description: "历史评估中超出 5 分制的分数标为“待复核”，不再参与推荐、画像和导出；新评估拒绝无效分数。" },
          { description: "画像分数限制在有效范围，旧的异常数值不再作为当前竞争力展示。" },
          { description: "扫描岗位只保存真实 JD 正文；遇到招聘网站的人机验证时明确提示补录，不再把验证页当职位描述。" },
          { description: "登录页左右区域过渡更柔和，首页标题、状态菜单与卡片的层级和遮挡问题已调整。" },
          { description: "版本更新页收紧排版，并列出可核实的历史生产版本。" },
        ],
      },
      {
        title: "首次发布",
        changes: [
          {
            title: "全新界面：纸鸢配色与双面板",
            description: "界面换上纸鸢朱砂新配色；报告和证据材料移入独立的“分析台”面板，聊天界面保持清爽；左侧旅程栏展示求职任务进度。",
          },
          {
            title: "任务响应更快、更透明",
            description: "发出任务后立即开始执行并给出回执；理解、执行、核对和输出阶段都有进度提示，委派与交接以卡片形式可见。",
          },
          {
            title: "对话记录不再闪烁或错乱",
            description: "点击历史会话后立即展示对应内容，后台刷新只更新当前选中的对话；快速切换也不会把其他对话的消息混进来。",
          },
          {
            title: "简历工作与项目经历分栏",
            description: "新导入简历区分工作职责和项目段落；已保存的简历可先预览分栏并撤销，核对无误后再保存。",
          },
          {
            title: "工作台卡片与文字更清晰",
            description: "各页面改用暖色半透明卡片、细边框与柔和阴影；JD 管理的标题、说明和正文增加底衬与对比度。",
          },
          {
            title: "输入与滚动体验升级",
            description: "输入框随内容自动伸缩，Enter 发送、Shift+Enter 换行，支持粘贴截图；长对话自动停留在最新消息，向上翻阅时不会被强行拉回底部。",
          },
          {
            title: "高风险操作统一审批卡",
            description: "写入画像、保存简历等敏感操作显示统一的批准或拒绝卡片，处理结果和历史状态清晰可见。",
          },
        ],
      },
    ],
  },
  {
    version: "0.11.0",
    stage: "development",
    summary: "Agent 连贯性与双面画布的开发整合阶段。",
    sections: [
      {
        title: "开发整合记录",
        changes: [
          { description: "Run 准入改为确定性入口，意图识别成为 Worker 的首个步骤。" },
          { description: "Worker 成为对话记录的唯一写入者，统一 Agent 事件词汇和任务状态。" },
          { description: "聊天界面接入 assistant-ui，逐步落地双面画布、旅程栏和审批卡。" },
        ],
      },
    ],
    caveat: "该阶段未作为独立生产版本发布，以上为 Git 中可核实的开发整合内容。",
  },
  {
    version: "0.10.8",
    stage: "development",
    summary: "基于 dev 的 Agent 运行时与 0.10.7 行为整合。",
    sections: [
      {
        title: "开发整合记录",
        changes: [
          { description: "以 Worker 作为 Agent 生产执行路径，保留回执、requestId 幂等、截图诊断和 JD 匹配范围约束。" },
          { description: "增加兼容的 JD 匹配与 M5 记忆 schema、迁移前检查和备份门禁。" },
        ],
      },
    ],
    caveat: "该阶段未作为独立生产版本发布，以上为 Git 中可核实的开发整合内容。",
  },
  {
    version: "0.10.7",
    stage: "production",
    summary: "0.12.0 之前的生产版本，改进 Agent 稳定性与 JD 匹配。",
    sections: [
      {
        title: "主要更新",
        changes: [
          { description: "回答、JD 和简历识图及岗位页提取统一使用 deepseek-flash，长图分段识别。" },
          { description: "简历截图或 PDF 无对应 JD 时也可评估内容、结构和可读性。" },
          { description: "消息确认超时后核实送达状态，切换会话时隔离任务，发送失败时保留输入。" },
          { description: "JD 不匹配简历的明确要求对同一份 JD 持续生效，换 JD 时恢复默认。" },
          { description: "增加版本更新入口，优化对话滚动、历史栏和任务停止操作。" },
        ],
      },
    ],
  },
  {
    version: "0.10.6",
    stage: "production",
    summary: "已核实的较早生产版本。",
    sections: [
      {
        title: "已核实信息",
        changes: [
          { description: "历史生产检查确认当时的 Web 与 Agent Worker 在线，Agent 主循环及图片识别使用 deepseek-flash。" },
        ],
      },
    ],
    caveat: "此版本的逐项更新记录尚未找到可靠来源，暂不补写未经核实的变更。",
  },
];
