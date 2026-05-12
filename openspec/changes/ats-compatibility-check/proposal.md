## Why

简历投递前不知道能不能过 ATS（Applicant Tracking System）机器筛选。缺失联系方式、无量化数据、section 不完整都会导致直接被刷。需要一个自动化检查告诉用户简历哪里有问题。

## What Changes

- 新建 `/api/cv/ats-check` 端点：prompt-based 检查 CV 全文
- 新建 `ats-check` 工具：Agent 可调用的 ATS 检查
- 检查维度：联系方式、量化密度、关键词、section 完整性、格式问题

## Capabilities

- `ats-check-tool`: Agent 工具——检查 CV 全文的 ATS 兼容性，输出问题清单和修复建议

## Impact

- **新建**: `frontend/src/app/api/cv/ats-check/route.ts`
- **新建**: `frontend/src/lib/agent/tools/query/ats-check.ts`
- **修改**: `frontend/src/lib/agent/tools/index.ts`
