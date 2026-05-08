# 模式：pipeline — URL收件箱批量处理（中文版）

处理 `data/pipeline.md` 中积累的职位URL。用户随时添加URL，然后运行 `/career-ops pipeline` 批量处理。

## 工作流

1. **读取** `data/pipeline.md` → 找到"待处理"（Pendientes）下的 `- [ ]` 条目
2. **对每个待处理的URL**：
   a. 计算下一个 REPORT_NUM 顺序号（读取 `reports/`，取最高编号+1）
   b. **提取JD**：Playwright (browser_navigate + browser_snapshot) → WebFetch → WebSearch
   c. 如果URL无法访问 → 标记为 `- [!]` 加备注，继续下一个
   d. **执行完整 auto-pipeline**：按 `modes/zh/jianzhi.md` 的 A-G 评估 → 保存报告.md → PDF生成（如 score >= 3.0）→ 追踪表
   e. **从"待处理"移到"已处理"**：`- [x] #NNN | URL | 公司 | 岗位 | Score/5 | PDF ✅/❌`
3. **如果有 3+ 个待处理URL**，启动并行 agent（Agent tool with `run_in_background`）最大化处理速度。
4. **完成后展示汇总表**：

```
| # | 公司 | 岗位 | Score | PDF | 建议操作 |
|---|------|------|-------|-----|---------|
| 143 | 字节跳动 | AI产品经理 | 4.2/5 | ✅ | 推荐投递 |
| 144 | 小公司 | AI运营 | 2.1/5 | ❌ | 不推荐 |
```

## pipeline.md 格式

```markdown
## 待处理
- [ ] https://www.zhipin.com/job_detail/xxx.html
- [ ] https://www.lagou.com/jobs/yyy.html | 某公司 | AI运营
- [!] https://private.url/job — 错误：需登录

## 已处理
- [x] #143 | https://www.zhipin.com/job_detail/zzz.html | 字节跳动 | AI产品经理 | 4.2/5 | PDF ✅
- [x] #144 | https://www.lagou.com/jobs/www.html | 某公司 | AI运营 | 2.1/5 | PDF ❌
```

## 从URL智能提取JD

1. **Playwright（首选）：** `browser_navigate` + `browser_snapshot`。适用所有 SPA 平台。
2. **WebFetch（备选）：** 用于静态页面或 Playwright 不可用时。
3. **WebSearch（最后手段）：** 搜索其他索引了该JD的平台。

**特殊情况：**
- **Boss直聘：** 可能需要模拟登录或处理反爬。如果失败，请用户手动粘贴JD。
- **拉勾/猎聘：** 试试 WebFetch + 关键信息提取。
- **脉脉/领英中国：** 可能需要登录。
- **企业官网招聘页：** Playwright 通常可以直接访问。

**如果URL需要登录 →** 标记 `- [!]` 并备注"需要登录，手动处理"。

## 处理完成后的建议

根据分数给出操作建议：

| 分数 | 操作建议 |
|------|---------|
| 4.5+ | 🟢 立即投递，优先准备面试 |
| 4.0-4.4 | 🟢 推荐投递，按需定制简历 |
| 3.5-3.9 | 🟡 可投可不投，如缺少目标岗位可以投 |
| 低于3.5 | 🔴 建议跳过，除非有特殊原因 |
