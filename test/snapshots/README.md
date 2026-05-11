# 评分基准测试 (Scoring Snapshots)

每个 snapshot 文件包含：
- JD 文本
- 期望风险检测结果（信号数、风险总分、风险等级）
- 期望评分范围（1-5）
- 测试日期和说明

运行方式：
```bash
node scripts/scan-risks.mjs --jd-file test/snapshots/001-clean-jd.txt
node scripts/simulate-risk-report.mjs --jd-file test/snapshots/002-suspect-jd.txt
```

用途：
- 修改 mode 文件后回归测试
- 修改 risk-intel 知识库后验证
- 新增风险信号后确保无退化
