# Agent UI 在纸鸢 API 后复用开源 Harness 模式

我们决定保留纸鸢暖色手帐视觉与现有品牌 token，只在 `/agent` 垂直切片中使用 Ant Design 的基础交互和无障碍能力，并把 `thinking-orbs` 封装为纸鸢自己的过程状态组件。DeepSeek Harness 的 TypeScript 投影、可见性、Presentation Intent 和折叠节点可以在 MIT 条件下按需移植；Codex 的 Item 生命周期、delta/final、summary/full 和空内容规则以 TypeScript 适配，复制实质代码时保留 Apache-2.0 LICENSE、NOTICE、版权和来源 commit。项目不搬入完整 harness，也不采用默认 Ant Design 企业皮肤、raw-result fallback、开发者终端 UI 或普通用户 raw reasoning 开关，以控制耦合、品牌漂移和许可证成本。
