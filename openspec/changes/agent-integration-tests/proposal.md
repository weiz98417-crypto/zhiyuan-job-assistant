## Why

当前所有新工具上线后靠手动测试发现 bug——路由错误、JSON 解析失败、API 超时。每次修一个 bug 测一步，效率极低。需要一套自动化集成测试：每个工具注册时自动验证 handler、formatResult、API 端点健康。

## What Changes

1. **`scripts/test-tools.mjs`**：工具集成测试脚本——遍历 ToolRegistry，调每个 handler → 验证返回值格式 → 验证不抛异常
2. **`scripts/test-routing.mjs`**：意图路由测试——输入示例问题 → 验证路由到正确的 agent
3. **`package.json`** 加 `test:tools` 命令

## Capabilities

- `tool-integration-tests`: 每个工具自动验证 handler 可执行、formatResult 无异常、返回格式正确

## Impact

- **新建**: `scripts/test-tools.mjs`
- **新建**: `scripts/test-routing.mjs`
- **修改**: `package.json`（加 test 命令）
