# 风险情报库 — Risk Intelligence v1.0.0 (2026-05-09)

<!--
  Version: 1.0.0 — 30 terms, 10 patterns, 3 employment types, 46 salary entries
  MAJOR: reorganizing categories | MINOR: new category or >10 entries | PATCH: individual entries
-->

```yaml
# === 招聘黑话词典 ===
# {term, meaning, severity, category, false_positive_notes}
terms:
  - term: "亲自带"
    meaning: "公司没有培训体系，老板直接盯着干活；或无限制加班"
    severity: high
    category: 加班/管理信号
    false_positive_notes: ""

  - term: "弹性工作制"
    meaning: "上班时间固定，下班时间弹性——越弹越晚，弹走周末，无加班费"
    severity: medium
    category: 加班信号
    false_positive_notes: ""

  - term: "扁平化管理"
    meaning: "公司人少（可能不到20人），老板一人说了算，谁都能来管你"
    severity: low
    category: 管理信号
    false_positive_notes: ""

  - term: "抗压能力强"
    meaning: "加班多、能背锅、且不要加班费"
    severity: medium
    category: 加班信号
    false_positive_notes: ""

  - term: "薪资上不封顶"
    meaning: "底薪极低或不保底，全靠提成"
    severity: medium
    category: 薪资信号
    false_positive_notes: ""

  - term: "工资面议"
    meaning: "薪资太低不好意思写出来，或根据面试表现压价"
    severity: low
    category: 薪资信号
    false_positive_notes: ""

  - term: "工资范围6k-12k"
    meaning: "实际就是6k，上限只是吸引投递的手段"
    severity: low
    category: 薪资信号
    false_positive_notes: ""

  - term: "有活力的年轻团队"
    meaning: "团队成员平均工作经验<1年，缺乏资深指导"
    severity: low
    category: 管理信号
    false_positive_notes: ""

  - term: "期权激励"
    meaning: "工资更低，期权大概率无法兑现（画饼）"
    severity: medium
    category: 薪资信号
    false_positive_notes: ""

  - term: "能独立完成任务"
    meaning: "前端+后端+测试+运营全你一个人干，身兼数职"
    severity: medium
    category: 管理信号
    false_positive_notes: ""

  - term: "上升空间大/晋升快"
    meaning: "薪资起点低、总有人离职所以升得快"
    severity: low
    category: 管理信号
    false_positive_notes: ""

  - term: "包三餐/有班车"
    meaning: "早晚都得加班 / 公司偏僻到没地铁"
    severity: low
    category: 加班信号
    false_positive_notes: ""

  - term: "零食饮料随便吃"
    meaning: "暗示加班很多，用零食替代加班费"
    severity: low
    category: 加班信号
    false_positive_notes: ""

  - term: "工作有激情/有上进心"
    meaning: "经常无偿加班还得表现得很开心"
    severity: medium
    category: 加班信号
    false_positive_notes: ""

  - term: "拆解报告"
    meaning: "岗位更看重候选人的业务理解、问题拆解和结构化表达；这不是负面黑话，但暗示只投常规简历竞争力会弱"
    severity: low
    category: AI岗位筛选信号
    false_positive_notes: "AI/产品/策略岗常见加分项，不等同于诈骗或加班风险"

  - term: "Agent 作品"
    meaning: "岗位希望看到可运行的 AI Agent/自动化工作流作品，筛选标准偏实操和作品集，不只是简历关键词"
    severity: low
    category: AI岗位筛选信号
    false_positive_notes: "如果要求付费培训、代做作品或交源码账号，则需另行判断风险"

  - term: "下午茶"
    meaning: "偏非正式邀约/轻面试话术，通常表示优先沟通或快速初筛；不一定是风险，但说明对方想先看候选人的主动产出"
    severity: low
    category: 面试邀约信号
    false_positive_notes: "大厂/创业团队招聘中可能只是轻松表达，不应直接判定为不正规"

  - term: "不强制加班/不提倡加班"
    meaning: "别人都在加你走一个试试——该加的班一样不少"
    severity: medium
    category: 加班信号
    false_positive_notes: ""

  - term: "责任心强"
    meaning: "活不干完不准走，出了问题全是你的"
    severity: medium
    category: 加班信号
    false_positive_notes: ""

  - term: "核心团队来自BAT"
    meaning: "老板队伍里有在大厂实习过的也算，甚至只是待过几天"
    severity: low
    category: 夸大信号
    false_positive_notes: ""

  - term: "公司计划短期内上市"
    meaning: "画饼——计划赶不上变化，大概率不会上市"
    severity: low
    category: 夸大信号
    false_positive_notes: ""

  - term: "招小可爱/招助理/招徒弟/招学徒"
    meaning: "疑似诈骗——以招聘为名诱导交培训费或套取个人信息"
    severity: critical
    category: 诈骗信号
    false_positive_notes: ""

  - term: "零基础拿高薪/不限经验不限学历"
    meaning: "虚假引流——用低门槛+高薪吸引投递，实为培训贷或诈骗"
    severity: critical
    category: 诈骗信号
    false_positive_notes: ""

  - term: "管培生/管培制"
    meaning: "可能是招转培变种——以管培为名要求付费培训。正规管培生项目有明确轮岗计划和淘汰标准"
    severity: high
    category: 诈骗信号
    false_positive_notes: ""

  - term: "试岗期/见习期"
    meaning: "变种试用期——法律上不存在试岗期，只要提供劳动就构成劳动关系。用于白嫖劳动力"
    severity: high
    category: 合同陷阱
    false_positive_notes: ""

  - term: "刷脸入职/人脸录入"
    meaning: "可能被诱导办理贷款——拿走手机录入人脸实为刷脸贷款"
    severity: critical
    category: 诈骗信号
    false_positive_notes: ""

  - term: "付费内推/买工作"
    meaning: "声称与央企/大厂有深度合作，收取高额内推费后失联。正规企业招聘不收取任何费用"
    severity: critical
    category: 诈骗信号
    false_positive_notes: ""

  - term: "自愿放弃社保/自愿放弃加班费"
    meaning: "违法条款——社保是法定义务不能自愿放弃，加班费是法定权利"
    severity: high
    category: 合同陷阱
    false_positive_notes: ""

  - term: "阴阳合同"
    meaning: "两份薪酬不同的合同——一份应付检查，一份实际执行。违规且维权困难"
    severity: high
    category: 合同陷阱
    false_positive_notes: ""

  - term: "空白合同"
    meaning: "薪资、岗位、工作地点等关键条款留白，日后随意填写——绝对不要签"
    severity: high
    category: 合同陷阱
    false_positive_notes: ""

  - term: "竞业限制全员签订"
    meaning: "竞业限制通常仅适用于涉密或高级岗位。全员签订且无补偿金是滥用"
    severity: medium
    category: 合同陷阱
    false_positive_notes: ""

  - term: "市场调研/课题研究兼职"
    meaning: "可能是间谍套路——以调研为名收集敏感信息（国安部2026年4月专项警示）"
    severity: critical
    category: 诈骗信号
    false_positive_notes: ""

  - term: "居家办公日薪几百"
    meaning: "可能是刷单诈骗或电信诈骗团伙——以高薪日结为诱饵拉人下水"
    severity: critical
    category: 诈骗信号
    false_positive_notes: ""

# === 骗术模式库 ===
# {pattern, description, signals[], severity, false_positive_notes}
patterns:
  - pattern: "招转培/培训贷"
    description: "以招聘为名诱导参加高价培训，引导办理分期贷款。培训质量低劣，承诺工作不兑现"
    signals:
      - "先培训后上岗"
      - "岗前实训"
      - "培训合格直接入职"
      - "培训费从工资里扣"
      - "包就业"
      - "保底月薪过万"
      - "零基础拿高薪"
      - "分期付款"
      - "先学后付"
      - "就业保障协议"
    severity: critical
    false_positive_notes: ""

  - pattern: "央国企内推/保录骗局"
    description: "谎称与央企HR有深度合作，收取高额'内推费''保录费'后失联。涉案金额可达数千万"
    signals:
      - "央国企内推"
      - "直签保录"
      - "保录名额"
      - "上岸央国企"
      - "跳过笔试直接入职"
      - "内部渠道"
      - "内推费"
      - "保录费"
      - "有关系/有人"
    severity: critical
    false_positive_notes: ""

  - pattern: "虚假招聘/货不对板"
    description: "岗位标题与实际工作严重不符——以市场专员名义招聘，实际从事传销/电诈。或JD内容与面试描述差异巨大"
    signals:
      - "不限专业不限学历"
      - "日结/周结"
      - "在家可做"
      - "轻松月入过万"
      - "招聘人数：若干/不限"
    severity: critical
    false_positive_notes: ""

  - pattern: "违规收费"
    description: "以服装费、押金、保证金、体检费、政审费等名义向求职者收取费用。《劳动合同法》第9条明文禁止"
    signals:
      - "服装费"
      - "押金"
      - "保证金"
      - "培训费"
      - "政审费"
    severity: critical
    false_positive_notes: ""

  - pattern: "传销伪装招聘"
    description: "以正规公司招聘为名，实际从事传销活动。通常要求拉人头、交入门费、发展下线"
    signals:
      - "发展团队"
      - "下线提成"
      - "入门费"
      - "会员等级"
      - "拉人头"
    severity: critical
    false_positive_notes: ""

  - pattern: "试用期陷阱"
    description: "超长试用期、试岗期、见习期等变种——法律上不存在试岗期。试用期白嫖式辞退后循环招聘"
    signals:
      - "试岗期"
      - "见习期"
      - "试用期6个月"
      - "试用期不交社保"
      - "试用期工资"
    severity: high
    false_positive_notes: ""

  - pattern: "合同陷阱"
    description: "阴阳合同、空白合同、霸王合同——含违法免责条款或关键信息留白"
    signals:
      - "自愿放弃"
      - "空白合同"
      - "阴阳合同"
      - "口头承诺"
      - "合同留白"
    severity: high
    false_positive_notes: ""

  - pattern: "竞业限制滥用"
    description: "全员签订竞业限制协议，无补偿金却有高额违约金"
    signals:
      - "竞业限制"
      - "竞业禁止"
      - "不得从事"
      - "禁止入职"
    severity: medium
    false_positive_notes: ""

  - pattern: "付费内推"
    description: "声称与国企/央企/大厂有深度合作，收取内推费/保录费后失联"
    signals:
      - "付费内推"
      - "内推费"
      - "保录费"
      - "买工作"
      - "内部名额"
    severity: critical
    false_positive_notes: ""

  - pattern: "间谍/国安套路"
    description: "以市场调研、课题研究、数据采集为名，收集敏感信息（国安部2026年4月专项警示）"
    signals:
      - "市场调研"
      - "课题研究"
      - "数据采集"
      - "信息收集"
      - "敏感信息"
    severity: critical
    false_positive_notes: ""

# === 用工形式风险矩阵 ===
# {type, risks[], risk_level, disclosed_risk_level}
employment_types:
  - type: "劳务派遣"
    risks:
      - "同工不同酬"
      - "无正式编制"
      - "裁员优先"
      - "五险一金可能按最低标准"
    risk_level: medium
    disclosed_risk_level: low

  - type: "外包"
    risks:
      - "无甲方福利"
      - "项目结束即解约"
      - "职业发展受限"
      - "转正概率低"
    risk_level: medium
    disclosed_risk_level: low

  - type: "第三方合同"
    risks:
      - "与招聘主体非同一法人"
      - "劳动关系不清晰"
      - "维权困难"
    risk_level: high
    disclosed_risk_level: medium

# === 行业薪资基准 ===
# {city, industry, level, min, max, unit}
# 覆盖：一线+新一线 19城 × 互联网3职级 + AI/金融/电商核心城市
# 数据来源：智联招聘2025AI人才报告 + 脉脉2025人才迁徙报告 + Boss直聘/猎聘公开数据
# 偏离 ±30% → 🟡 | ±50% → 🔴
salary_benchmarks:
  # ═══ 互联网 · 1-3年 ═══
  - {city: 北京, industry: 互联网, level: 1-3年, min: 12000, max: 20000, unit: 月薪/税前}
  - {city: 上海, industry: 互联网, level: 1-3年, min: 10000, max: 18000, unit: 月薪/税前}
  - {city: 深圳, industry: 互联网, level: 1-3年, min: 10000, max: 18000, unit: 月薪/税前}
  - {city: 广州, industry: 互联网, level: 1-3年, min: 8000, max: 15000, unit: 月薪/税前}
  - {city: 杭州, industry: 互联网, level: 1-3年, min: 9000, max: 17000, unit: 月薪/税前}
  - {city: 成都, industry: 互联网, level: 1-3年, min: 7000, max: 13000, unit: 月薪/税前}
  - {city: 武汉, industry: 互联网, level: 1-3年, min: 6000, max: 12000, unit: 月薪/税前}
  - {city: 南京, industry: 互联网, level: 1-3年, min: 7000, max: 14000, unit: 月薪/税前}
  # ═══ 互联网 · 3-5年 ═══
  - {city: 北京, industry: 互联网, level: 3-5年, min: 20000, max: 35000, unit: 月薪/税前}
  - {city: 上海, industry: 互联网, level: 3-5年, min: 18000, max: 32000, unit: 月薪/税前}
  - {city: 深圳, industry: 互联网, level: 3-5年, min: 18000, max: 30000, unit: 月薪/税前}
  - {city: 广州, industry: 互联网, level: 3-5年, min: 15000, max: 25000, unit: 月薪/税前}
  - {city: 杭州, industry: 互联网, level: 3-5年, min: 16000, max: 30000, unit: 月薪/税前}
  - {city: 成都, industry: 互联网, level: 3-5年, min: 12000, max: 20000, unit: 月薪/税前}
  - {city: 武汉, industry: 互联网, level: 3-5年, min: 11000, max: 18000, unit: 月薪/税前}
  - {city: 南京, industry: 互联网, level: 3-5年, min: 13000, max: 20000, unit: 月薪/税前}
  - {city: 苏州, industry: 互联网, level: 3-5年, min: 12000, max: 22000, unit: 月薪/税前}
  - {city: 西安, industry: 互联网, level: 3-5年, min: 10000, max: 18000, unit: 月薪/税前}
  - {city: 长沙, industry: 互联网, level: 3-5年, min: 10000, max: 18000, unit: 月薪/税前}
  - {city: 天津, industry: 互联网, level: 3-5年, min: 10000, max: 20000, unit: 月薪/税前}
  - {city: 重庆, industry: 互联网, level: 3-5年, min: 10000, max: 20000, unit: 月薪/税前}
  - {city: 郑州, industry: 互联网, level: 3-5年, min: 9000, max: 16000, unit: 月薪/税前}
  - {city: 东莞, industry: 互联网, level: 3-5年, min: 11000, max: 20000, unit: 月薪/税前}
  - {city: 青岛, industry: 互联网, level: 3-5年, min: 10000, max: 18000, unit: 月薪/税前}
  - {city: 沈阳, industry: 互联网, level: 3-5年, min: 8000, max: 15000, unit: 月薪/税前}
  - {city: 宁波, industry: 互联网, level: 3-5年, min: 10000, max: 18000, unit: 月薪/税前}
  - {city: 昆明, industry: 互联网, level: 3-5年, min: 8000, max: 15000, unit: 月薪/税前}
  # ═══ 互联网 · 5-10年 ═══
  - {city: 北京, industry: 互联网, level: 5-10年, min: 28000, max: 50000, unit: 月薪/税前}
  - {city: 上海, industry: 互联网, level: 5-10年, min: 25000, max: 45000, unit: 月薪/税前}
  - {city: 深圳, industry: 互联网, level: 5-10年, min: 25000, max: 42000, unit: 月薪/税前}
  - {city: 广州, industry: 互联网, level: 5-10年, min: 20000, max: 38000, unit: 月薪/税前}
  - {city: 杭州, industry: 互联网, level: 5-10年, min: 22000, max: 40000, unit: 月薪/税前}
  - {city: 成都, industry: 互联网, level: 5-10年, min: 16000, max: 30000, unit: 月薪/税前}
  # ═══ AI/人工智能 · 3-5年 ═══
  # 注：AI产品经理较普通PM薪资溢价约20%，杭州为全国最高(平均28.6K)
  - {city: 杭州, industry: AI, level: 3-5年, min: 22000, max: 45000, unit: 月薪/税前}
  - {city: 北京, industry: AI, level: 3-5年, min: 22000, max: 42000, unit: 月薪/税前}
  - {city: 上海, industry: AI, level: 3-5年, min: 20000, max: 40000, unit: 月薪/税前}
  - {city: 深圳, industry: AI, level: 3-5年, min: 20000, max: 38000, unit: 月薪/税前}
  # ═══ 金融科技 · 3-5年 ═══
  - {city: 北京, industry: 金融科技, level: 3-5年, min: 20000, max: 40000, unit: 月薪/税前}
  - {city: 上海, industry: 金融科技, level: 3-5年, min: 18000, max: 36000, unit: 月薪/税前}
  - {city: 深圳, industry: 金融科技, level: 3-5年, min: 18000, max: 35000, unit: 月薪/税前}
  - {city: 杭州, industry: 金融科技, level: 3-5年, min: 16000, max: 32000, unit: 月薪/税前}
  # ═══ 电商 · 3-5年 ═══
  - {city: 北京, industry: 电商, level: 3-5年, min: 16000, max: 30000, unit: 月薪/税前}
  - {city: 上海, industry: 电商, level: 3-5年, min: 16000, max: 28000, unit: 月薪/税前}
  - {city: 杭州, industry: 电商, level: 3-5年, min: 15000, max: 28000, unit: 月薪/税前}
  - {city: 深圳, industry: 电商, level: 3-5年, min: 15000, max: 28000, unit: 月薪/税前}
  - {city: 广州, industry: 电商, level: 3-5年, min: 13000, max: 25000, unit: 月薪/税前}

# === 公司风险信号 ===
# {company_slug, signal, description, source, severity}
company_risks: []
```
