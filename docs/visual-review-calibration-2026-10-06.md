# 视觉反测门禁 · 校准记录(spec 38)

## 首跑(2026-10-06,deepseek-flash 视觉,temperature 0)

- 三份样本(thin-junior / standard / dense-senior)全部产出结构化四维批评,批评质量高:每条问题带具体位置(「EXPERIENCE 三个时间段未右对齐成列」「联系方式行悬空 |」),无空泛输出。
- 首跑分数(分维 0-10,总 40):thin-junior 5/3/6/7=21 · standard 5/4/4/6=19 · dense-senior 6/5/5/7=23。**门禁红 10 条**——模板未达「HR 三秒扫视」线,与 CEO 判断一致。
- **首跑即抓出两个真实渲染缺陷**(同日修复,非美化):恒空板块(Certifications/Languages & Tools)只渲染标题不渲染内容;联系方式行空字段渲染悬空 `|`。修复后重跑,violation 11→10。
- LLM 抖动观察:同内容两次运行单维波动 ±1(6/3/6/6 → 5/3/6/7),回归门禁阈值 2 分可容忍。

## 校准决策

- 阈值初值:单维 ≥6、总分 ≥24。按首跑数据(最差样本总 19)明显红——预期内,美化列车(回访验证后立项)把它做绿。
- 基线纪律:门禁红**不覆盖基线**(防棘轮下滚);基线只在绿通过时更新,存当次分数+内容哈希。
- 评审模型:`deepseek-flash`(vision 实测可用);`DEEPSEEK_VISION_MODEL` 环境变量可切。单样本 1-2k 图像 tokens,三样本全跑约 ¥0.01-0.03。

## 运行方式

`npm run verify:resume-visual`(本地手动;需 DEEPSEEK_API_KEY 与 Playwright chromium)。退出码:0 绿 / 1 观感红 / 2 基建失败。不进 capability-evals(概率性,先攒数据)。
