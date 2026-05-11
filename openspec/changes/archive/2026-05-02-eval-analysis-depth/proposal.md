## Why

当前 JD 评估只有 7 块结构化报告 + 总分，但没有告诉用户**具体哪里不匹配、缺什么技能、JD 级别是否合适**。用户看完报告还是不知道"我该补什么才能投这个岗位"。评估需要从"打分"升级为"可行动的改进清单"。

## What Changes

- 评估 API 新增三个分析维度：关键词覆盖率、技能缺口、职级匹配
- 评估报告 UI 新增可视化区块：关键词覆盖率条、技能缺口表、级别匹配指示
- 差异化提示：AI 标注 JD 最强调的点与简历最弱段的对比

## Capabilities

### New Capabilities
- `keyword-coverage`: JD 关键词与简历技能逐项对比，覆盖率可视化（绿色已覆盖/红色缺失/黄色可加强）
- `skill-gap-analysis`: 识别 JD 要求但简历缺失的技能，标注必需/加分、可替代性
- `level-match`: 判断 JD 级别是否匹配用户经验年限，输出偏低/匹配/偏高/跃升
- `differentiation-tips`: AI 标注 JD 最强调的能力与简历中薄弱环节的对比

### Modified Capabilities
<!-- 无已有 spec 被修改 -->

## Impact

- `frontend/src/app/api/evaluate/route.ts` — prompt 扩展，新增分析维度
- `frontend/src/app/evaluate/page.tsx` — 报告 UI 新增可视化区块
- `frontend/src/lib/db.ts` — EvaluationReport 类型可能需扩展（新增字段存储分析结果）
- `frontend/src/types/index.ts` — 扩展 EvaluationScores / EvaluationReport 类型
