## ADDED Requirements

### Requirement: 初次定位——结构化渐进式对话

当用户首次使用自我定位且画像 goals 为空时，系统 SHALL 通过结构化渐进式对话引导用户完成职业定位，在 3-5 分钟内产出包含目标方向、匹配依据、推荐试投岗位和下一步行动的定位卡。

#### Scenario: 状态摸底

- **WHEN** 用户触发自我定位且 profile.goals 为空
- **THEN** Agent SHALL 首先询问用户当前状态："A. 已经在投简历找工作了 / B. 有大概方向但不知道具体投什么 / C. 完全没方向，需要从零探索 / D. 有几个方向在纠结需要比较"
- **AND** 用户回答后，Agent SHALL 根据选择进入对应深挖路径

#### Scenario: 路径 A——已投过定向确认

- **WHEN** 用户选择 A（已经在投）
- **THEN** Agent SHALL 先回顾用户投过的岗位方向和反馈
- **AND** SHALL 聚焦确认当前方向是否准确、是否有需要调整的子方向

#### Scenario: 路径 B——有方向需细化

- **WHEN** 用户选择 B（有方向但不具体）
- **THEN** Agent SHALL 聚焦该方向，从技能匹配、市场热度、薪资区间做细化
- **AND** SHALL 给出该方向下 2-3 个具体岗位名称

#### Scenario: 路径 C——没方向需探索

- **WHEN** 用户选择 C（完全没方向）
- **THEN** Agent SHALL 使用反向排除法优先（"你最不想做什么？"）
- **AND** 结合兴趣探测（"你做什么事会忘记时间？"）
- **AND** 最终输出 2-3 个可能方向供用户选择

#### Scenario: 路径 D——多方向纠结需比较

- **WHEN** 用户选择 D（几个方向在纠结）
- **THEN** Agent SHALL 对每个方向从技能匹配度、市场机会、薪资预期做简要对比
- **AND** SHALL 建议用户挑一个方向先试投 2-3 个 JD

#### Scenario: 深挖阶段追问规则

- **WHEN** 用户在深挖阶段给出有能量的回答（具体、有细节、提到成就感）
- **THEN** Agent SHALL 追问 1-2 层具体例子再换维度
- **AND** 每轮只问一个问题

#### Scenario: 输出定位卡

- **WHEN** 深挖阶段收集了足够信息（至少 3 轮有效回答）
- **THEN** Agent SHALL 输出结构化的定位卡：
  - 目标方向（1-3 个，附匹配依据）
  - 推荐试投岗位（每个方向 2-3 个具体岗位名）
  - 下一步行动（搜索 JD → 我来评估）
- **AND** SHALL 询问用户是否确认

### Requirement: 迭代更新——按场景分流的再入对话

当用户再次触发自我定位且画像 goals 已存在时，系统 SHALL 读取画像上下文（上次更新时间、近期活动摘要、偏好漂移指标），并根据用户意图走对应场景路径。

#### Scenario: 再入时展示上下文

- **WHEN** 用户触发自我定位且 profile.goals 非空
- **THEN** Agent SHALL 先展示简要上下文："你的画像上次更新是 X 天前。之后你评估了 N 个 JD、面了 M 家公司"
- **AND** SHALL 以开放式问题引导："有什么新发现想分享吗？还是方向没变？"

#### Scenario: 场景 A——用户带着新认知

- **WHEN** 用户表达方向偏好发生了变化（"我面试后发现 XX 方向更适合我"、"我觉得 XX 不适合我"）
- **THEN** Agent SHALL 深挖 1-2 轮确认变化原因
- **AND** SHALL 在确认后输出变更摘要，请求用户确认
- **AND** 用户确认后 SHALL 更新 profile.goals 并记录 history

#### Scenario: 场景 B——系统检测到偏好漂移

- **WHEN** 系统检测到用户最近 5 个 JD 评估中某个非目标 archetype 的平均分高于目标 archetype 平均分 0.5 以上
- **THEN** Agent SHALL 在对话开始时主动提示："我注意到你最近给 XX 方向的 JD 打分更高。你有没有意识到这个变化？"
- **AND** 用户承认 → 进入场景 A 流程；用户否认 → 不更新，记录该反馈

#### Scenario: 场景 C——用户随意聊聊

- **WHEN** 用户表达了开放式的迷茫或闲聊意图（"我也不知道，就想聊聊"）
- **THEN** Agent SHALL 保持轻量对话，不强制推进结构化流程
- **AND** 如果对话中出现明确信号（技能、偏好、约束），SHALL 记录到 profile_signals
- **AND** 不强制产出定位卡

#### Scenario: 场景 D——有具体触发事件

- **WHEN** 用户提及具体事件（"我刚面完 XX 公司"、"拿到了 offer"、"看了几个 JD"）
- **THEN** Agent SHALL 围绕该事件做结构化反思：什么收获？什么改变了你的看法？
- **AND** 有明确信号 → 更新画像；无明确信号 → 只记录 profile_signals

### Requirement: 画像写入——对话产出持久化

每次 dingwei 对话产出定位结果后，系统 SHALL 通过 API 将结果写入 SQLite 的 profiles 表和 profile_signals 表。

#### Scenario: 初次定位写入 goals

- **WHEN** 用户确认了定位卡中的目标方向
- **THEN** Agent SHALL 调用 mine_profile action=complete，触发 `PUT /api/data/profile` 写入 goals.targetRoles、history 条目
- **AND** `/profile` 页面 SHALL 在下次加载时展示新写入的目标岗位

#### Scenario: 迭代更新写入变更

- **WHEN** 用户在迭代对话中确认了方向变更
- **THEN** 系统 SHALL 更新 goals 并追加 history 条目（含变更原因）
- **AND** SHALL 记录 profile_signals 条目（source="dingwei", signal_type="role_preference"）

#### Scenario: 对话信号持续记录

- **WHEN** dingwei 对话中 Agent 检测到用户表达了与画像相关的信号（技能、偏好、约束、薪资期望）
- **THEN** Agent SHALL 每轮回答后调用 mine_profile action=answer 存储信号摘要
- **AND** 这些信号 SHALL 写入 profile_signals 表，供 Profile Engine 后续融合使用
