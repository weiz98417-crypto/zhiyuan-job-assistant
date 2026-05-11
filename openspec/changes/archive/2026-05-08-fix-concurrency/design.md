## Context

Agent 系统有两处明确的并发冲突：

1. **pipeline.md 并行建议 vs _shared.md 禁止规则**：`pipeline.md:14` 建议 3+ URL 时启动并行 agent，但 `_shared.md:123` 和 `zh/_shared.md:150` 明确禁止 2+ agent 同时使用 Playwright。Agent 遵循 pipeline 模式就会违反共享规则。

2. **报告编号竞争**：`pipeline.md:9` 让 agent "读取 reports/ 目录取最大编号 +1"，但并行 agent 读出同一个 max，写入同一个编号，后写覆盖先写。这是非原子的 read-check-write。

3. **扫描并发模型**：`scan.mjs:32` 设置 `CONCURRENCY = 10`，但 `detectApi()` 仅支持 Greenhouse/Ashby/Lever 三个海外 ATS。中国平台（Boss直聘、拉勾、猎聘）完全没有 API 覆盖，`portals.yml` 中配置的中国公司返回 `null`。

## Goals / Non-Goals

**Goals:**
- 消除 pipeline.md 中的并行建议与 Playwright 禁止规则之间的矛盾
- 实现原子化的报告编号分配，消除文件覆盖风险
- 明确 `scan.mjs` 的平台覆盖范围和 Playwright 回退机制

**Non-Goals:**
- 不引入进程级锁或分布式协调——系统是单机运行，文件系统原子操作足够
- 不为中国招聘平台编写 API 适配器——方案 C（外部数据采集）中再评估
- 不修改 Next.js 前端的并发模型

## Decisions

### Decision 1: pipeline.md 改为明确的串行顺序

**选择：** 删除 `pipeline.md:14` 的"Si hay 3+ URLs pendientes, lanzar agentes en paralelo"，替换为串行优先级：

1. 先处理 `scan.mjs` 可 API 扫描的 URL（不需要 Playwright）
2. 再逐个串行处理需要 Playwright 的 URL

**理由：** Playwright 是单浏览器实例，并行会相互干扰（页面导航冲突、cookie 污染）。API 扫描的 URL 可以用 `scan.mjs` 批量处理（HTTP 请求并行安全），但 Playwright 必须串行。

### Decision 2: 原子报告编号——文件系统目录锁

**选择：** 新建 `scripts/next-report-num.mjs`，使用 `mkdirSync` 在 `reports/.locks/` 下创建以编号命名的目录作为原子锁：

```javascript
function allocateReportNum() {
  const existing = readdirSync('reports/').filter(f => /^\d{3}-/.test(f));
  let max = existing.length ? Math.max(...existing.map(f => parseInt(f))) : 0;
  let num = max + 1;
  while (true) {
    try {
      mkdirSync(`reports/.locks/${String(num).padStart(3, '0')}`);
      return num; // 原子获取
    } catch (e) {
      if (e.code === 'EEXIST') { num++; continue; }
      throw e;
    }
  }
}
```

`mkdirSync` 在文件系统层面是原子的——两个进程同时 `mkdir` 同一个路径，只有一个成功（返回），另一个抛 `EEXIST`（自增重试）。

**替代方案：**
- *数据库自增 ID*：SQLite 的 `AUTOINCREMENT` 是原子的，但报告编号有语义意义（文件名前缀），不能完全依赖 DB。
- *写文件锁*：`writeFileSync` + `O_EXCL` 标志也可以，但 `mkdirSync` 更简洁且跨平台一致。

### Decision 3: scan.mjs 平台覆盖声明 + Playwright 回退标记

**选择：** 在 `portals.yml` 中增加 `scan_method` 字段：

```yaml
companies:
  - name: "字节跳动"
    scan_method: playwright  # API 不支持，需要 Playwright 回退
  - name: "Anthropic"
    careers_url: "https://boards.greenhouse.io/anthropic"
    scan_method: api  # Greenhouse API 支持
```

`scan.mjs` 读取此字段，跳过 `scan_method: playwright` 的公司（留给 Agent 处理），仅处理 `scan_method: api` 的公司。

在 `scan.mjs` 顶部增加注释文档说明支持的 ATS 及其覆盖范围。

## Risks / Trade-offs

1. **[R] 目录锁残留** → 如果 Agent 崩溃，`reports/.locks/042/` 目录残留，该编号永久跳过。
   → **缓解:** `next-report-num.mjs` 在分配前清理超过 1 小时的锁目录（`statSync` 检查创建时间）。

2. **[R] 串行化降低吞吐** → 删除并行后，3+ URL 的处理时间变长。
   → **缓解:** API 扫描的 URL 保留并行（`scan.mjs` 的 HTTP 请求），只有 Playwright 串行。实际瓶颈在浏览器端，不是网络层。

## Migration Plan

1. 创建 `scripts/next-report-num.mjs`
2. 更新 `modes/pipeline.md`: 删除并行建议，添加串行顺序和原子编号调用
3. 更新 `modes/_shared.md` + `modes/zh/_shared.md`: 强化 Playwright 禁止规则
4. 更新 `portals.yml`: 添加 `scan_method` 字段
5. 更新 `scan.mjs`: 读取 `scan_method`，跳过 playwright 标记的公司
6. 手动清理 `reports/.locks/` 目录（如果存在残留）
