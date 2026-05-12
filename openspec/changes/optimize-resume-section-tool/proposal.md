## Why

Agent 聊天里说"优化简历"→ 调了 `get_profile` 工具，而不是真正做 CV 优化。因为 resume agent 没有 `optimize_resume_section` 工具。CV 优化 API（`/api/cv/optimize-section` + judge-engine）已经存在，只需注册为 agent 工具。

## What Changes

- 新建 `optimize_resume_section` 工具：读 CV（SQLite `cv_data` 表）→ 调 `/api/cv/optimize-section` → 返回改写方案
- 修复意图路由："优化"匹配到 resume agent 而非 profile agent
- 数据流：SQLite 读写，localStorage 仅作 UI 缓存同步

## Capabilities

- `optimize-resume-section-tool`: Agent 可调用此工具优化简历任意 section。用户说"优化工作经历""改写技能栏""帮我把项目经验写得更量化"时触发。

## Impact

- **新建**: `frontend/src/lib/agent/tools/action/optimize-resume-section.ts`
- **修改**: `frontend/src/lib/agent/tools/index.ts`（注册）
- **修改**: `frontend/src/lib/agent/registry/agents/resume-agent.ts`（加 toolNames + 扩展 intentPatterns）
- **依赖**: `/api/cv/optimize-section`（已有）、`/api/cv/data`（已有 SQLite 端点）
