# Tasks: b-event-dialect

## 1. 单一事实源
- [ ] 1.1 新建共享事件方言类型模块（同构 import）：subagent.started/finished/error、step.started/finished（判据计数）、messages.snapshot、run.finished（中断结局）
- [ ] 1.2 现有事件名不动；模块内维护新旧映射表与回放兼容说明

## 2. 生产者
- [ ] 2.1 worker loop phase 边界发射 step 事件；payload 携带判据 n/m
- [ ] 2.2 委派（delegate_research）发射 subagent.* 事件（含 running 态与父子归因）
- [ ] 2.3 主责交接发射既有 agent_switch 并归入方言模块
- [ ] 2.4 图片识别长预算分段播报 step 进度

## 3. 消费者
- [ ] 3.1 观察者分发器统一 SSE/轮询两模式；补 agent_switch/intent/run_directive/result_quality 消费
- [ ] 3.2 agent_switch 刷新界面主责标签
- [ ] 3.3 渲染注册表与投影白名单由同一模块导出（类型→安全字段+组件）；无组件类型开发构建告警

## 4. 渲染组件
- [ ] 4.1 交接横幅卡（handoff/handoff_denied）
- [ ] 4.2 委派过程轨道（running）+ 委派结论卡（findings/keyPoints）
- [ ] 4.3 步骤轨道组件（四段 + 判据计数）

## 5. 传输与隔离
- [ ] 5.1 SSE 量化 1s → 250ms
- [ ] 5.2 信号提取去重键按会话分桶；主责标签随会话切换重置

## 6. 门禁
- [ ] 6.1 类型↔注册一致性断言测试
- [ ] 6.2 分发器合成事件序列测试（新旧混合）
- [ ] 6.3 步骤事件经 durable 引擎缝的断言
