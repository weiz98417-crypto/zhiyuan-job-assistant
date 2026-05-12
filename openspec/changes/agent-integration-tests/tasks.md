## 1. 工具集成测试

- [ ] 1.1 新建 `scripts/test-tools.mjs`——非浏览器环境调 tool handler，验证返回 `{ success: boolean }`
- [ ] 1.2 每个工具至少测 happy-path 和一个 edge case

## 2. 路由测试

- [ ] 2.1 新建 `scripts/test-routing.mjs`——输入示例问题 → 验证 classifyIntent 结果
- [ ] 2.2 覆盖：简历优化、JD评估、黑话解码、面试模拟、自我定位

## 3. 验证

- [ ] 3.1 `node scripts/test-tools.mjs` → 全部工具通过
- [ ] 3.2 `node scripts/test-routing.mjs` → 路由正确率 100%
