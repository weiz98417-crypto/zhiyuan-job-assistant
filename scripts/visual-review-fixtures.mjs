/**
 * 视觉反测样本夹具(spec 38):三份结构化简历,覆盖低密度/标准/高密度三档。
 * 只喂 buildCvHtml 的既有输入形状,不改渲染层。
 */

/** @typedef {{name: string, note: string, template: "clean"|"modern"|"compact", profile: {fullName: string, email: string, phone: string, summary?: string}, sections: Array<{id: string, title: string, content: string}>}} SampleResume */

/** @type {SampleResume[]} */
export const SAMPLE_RESUMES = [
  {
    name: "thin-junior",
    note: "低密度:应届生,内容单薄(考验留白是否失衡)",
    template: "clean",
    profile: { fullName: "王小明", email: "wxm@example.com", phone: "13800000000", summary: "AI 产品方向应届生,两段实习。" },
    sections: [
      { id: "education", title: "教育背景", content: "某某大学 · 信息管理与信息系统 本科 · 2022-2026" },
      { id: "experience", title: "实习经历", content: "某互联网公司 · AI 产品实习生 · 2025-2026\n协助整理 prompt 评测集,参与两次功能上线。" },
      { id: "skills", title: "技能", content: "Python / SQL / Figma / prompt 设计" },
    ],
  },
  {
    name: "standard",
    note: "标准密度:3-5 年经验(最常见的样本形态)",
    template: "modern",
    profile: { fullName: "李晓华", email: "lxh@example.com", phone: "13900000000", summary: "5 年推荐系统算法工程师,主导过两次大规模重构,带 6 人小团队。" },
    sections: [
      { id: "summary", title: "个人概述", content: "5 年推荐系统与排序算法经验,负责过日活千万级产品的召回与粗排模块,熟悉特征平台与在线实验体系,有从 0 到 1 建设团队规范的经验。" },
      { id: "experience", title: "工作经历", content: "某某科技 · 高级算法工程师 · 2021-至今\n负责信息流推荐召回模块重构,离线指标提升 8%,线上 CTR +3.2%;建设特征平台,特征上线周期从 2 周缩短到 2 天;带 6 人小组,负责三人晋升辅导。\n\n某某网络 · 算法工程师 · 2019-2021\n参与电商搜索排序优化,负责重排层;搭建 A/B 实验看板,实验吞吐提升 40%。" },
      { id: "projects", title: "项目经历", content: "统一召回平台 · 技术负责人\n多路召回统一化,支持 20+ 召回源插件化接入;沉淀文档与模板,新召回接入成本从人日级降到小时级。" },
      { id: "skills", title: "技能", content: "Python / C++ / TensorFlow / Spark;推荐系统全链路;特征工程与在线实验设计;团队管理与晋升辅导" },
    ],
  },
  {
    name: "dense-senior",
    note: "高密度:10 年+管理者,信息量打满(考验排版是否过挤)",
    template: "compact",
    profile: { fullName: "张致远", email: "zzy@example.com", phone: "13700000000", summary: "10 年 AI 技术管理者,从算法到平台到团队建设,经历 three 家公司六个岗位,擅长从零搭建技术团队与交付体系,主导过千万日活产品的算法中台建设,多次跨部门协同与向上管理经验,对大模型落地方向有完整实践。" },
    sections: [
      { id: "summary", title: "个人概述", content: "10 年 AI 领域经验,其中 5 年技术管理;完整经历推荐系统从规则到深度学习的三代演进;主导算法中台从 0 到 1(服务 8 条业务线,日均调用 30 亿次);管理过最大 35 人混合团队(算法 20/工程 10/产品 5);擅长目标拆解、跨部门协同、招聘与梯队建设;近两年聚焦大模型落地,完成 3 个生产级应用上线。" },
      { id: "experience", title: "工作经历", content: "某某集团 · AI 平台负责人 · 2021-至今\n搭建集团算法中台:统一特征/训练/推理三层,服务 8 条业务线,日均调用 30 亿次,机器成本降低 22%;组建 35 人团队(4 个小组),两年内完成 12 人晋升;推动大模型应用落地:智能客服(解决率 +15%)、内容审核(人力 -60%)、搜索改写(CTR +5%)。\n\n某某信息 · 算法专家 · 2018-2021\n电商推荐架构升级:多目标排序框架,GMV +6.8%;实时特征体系,延迟 P99 < 200ms;专利 4 项,顶会论文 2 篇。\n\n某某科技 · 算法工程师 · 2016-2018\n广告 CTR 预估模型迭代;反作弊策略;数据管道建设。" },
      { id: "projects", title: "项目经历", content: "算法中台一期 · 总负责人\n统一三地机房训练资源,GPU 利用率 35%→68%;建立模型上线双审机制,事故率归零。\n\n大模型客服系统 · 产品技术双负责人\nPrompt 工程+critic 模型双链路,人工转接率 -40%;沉淀评测集 3000 条。\n\n校招培养体系 · 发起人\n新人 90 天成长路径,留任率 85%→96%。" },
      { id: "education", title: "教育背景", content: "某某大学 · 计算机硕士 · 2014-2016\n某某大学 · 软件工程 学士 · 2010-2014" },
      { id: "skills", title: "技能", content: "算法:推荐/排序/NLP/LLM 应用;工程:PyTorch/TF/Spark/Flink/K8s;管理:35 人规模、双线晋升体系、跨部门项目群管理;其他:专利 6 项、顶会 3 篇、行业分享 20+ 场" },
    ],
  },
];
