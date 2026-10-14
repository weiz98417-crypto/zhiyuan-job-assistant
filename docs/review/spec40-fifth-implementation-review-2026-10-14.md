# Spec 40 第五批双轴审查

日期：2026-10-14，基线 `43ab742b65a6f5fee8ac1b1c5bf4849be6507200`。仅审查本批记忆 active 列表、episode 历史、实体来源/排名隔离及相关 PG/浏览器回归；内部冲突查询、实体摘要重建、全层擦除保持后续范围。

## Standards

`memory_browser_final` 独立审查发现默认 PostgreSQL `btrim` 与写入 JS trim 不一致，仅含 tab/newline/NBSP 的来源仍被当成有来源。返工为复用共享完整 trim 字符集的 `memorySourcePresenceSql`；真实 PG 首失败及修复后 39 项回归保留。最终硬规则违反 0，未修判断问题 0。证据保护沿用显式 fixture/build/manifest/runtime 绑定与原子排他写入。

## Spec

`remaining_inventory` 独立审查发现 episode 历史的 `entityKeys` 只绑定 owner，错误 core→private 关联会把私人名称带给只读 core 的 Agent。同根问题在 provenance 和 hybrid 的实体排名也存在。返工为三个读取路径均绑定同分区；真实 PG 混链反例检查历史和 provenance 不含私有 key、搜索不因私有 summary 命中、完整存储不变。

active 列表和 episode 历史统一完整抑制，owner 来源绑定与空白来源拒绝均满足本批范围。合法 invalid 历史保留；候选/纠正写入回执不变，内部写冲突查询未擅自隐藏事实。最后只读复审剩余 blocker 0。新增浏览器 FAULT 检查真实页面及 GET 的精确事实/候选集合、刷新与独立 PG 全快照，准确声明只证明读过滤，无物理擦除完成声明。

最终验证：320 文件/1986 通过/2 跳过；六组真实隔离 PG fixture 启用；production Web/Worker build、类型检查、定向 lint 和知识 drift 通过。真实 Chromium 四条全部通过，含第四批三条重新执行及新增故障反例；无模型/Worker，503 分支仍明确 browser mock。具体身份/首败/环境失败见 [第五批进度](../testing/spec40-fifth-implementation-progress-2026-10-14.md)。

完整 W07、67 问题、392 项外部验收和 B5 生产切换未全部关闭；内部写决策、摘要重建、跨层擦除/恢复及可信历史迁移继续阻断完整完成。两轴本切片剩余阻断项 0，不用于放行整个 Spec 或生产。
