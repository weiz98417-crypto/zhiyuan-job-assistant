## 1. API 端点

- [x] 1.1 新建 `frontend/src/app/api/cv/ats-check/route.ts`
- [x] 1.2 prompt 检查 5 维度：联系方式、量化数据、关键词、section 完整性、格式

## 2. Agent 工具

- [x] 2.1 新建 `frontend/src/lib/agent/tools/query/ats-check.ts`
- [x] 2.2 handler 调 `/api/cv/ats-check`
- [x] 2.3 注册到 `tools/index.ts`

## 3. 验证

- [x] 3.1 缺联系电话的 CV → 标记 🔴 缺失联系方式
- [x] 3.2 完整 CV → 输出 🟢 通过检查清单
