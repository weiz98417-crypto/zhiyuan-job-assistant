## MODIFIED Requirements

### Requirement: 工具结果质量检查

客户端 Agent Loop 中的 `checkResultQuality()` SHALL 新增 "garbled" 类别,用于识别编码异常导致的不可读文本。garbled 结果不触发自动重试,直接降级为用户交互或触发服务端 fallback。

#### Scenario: 正常结果

- **WHEN** 工具返回有意义、非空、非乱码的文本
- **THEN** checkResultQuality 返回 "good"

#### Scenario: 空结果

- **WHEN** 工具返回空字符串或"未找到相关结果"等空结果标识
- **THEN** checkResultQuality 返回 "empty"

#### Scenario: 无关结果

- **WHEN** 工具返回包含同名文化作品(电视剧/游戏/小说)的无效内容
- **THEN** checkResultQuality 返回 "irrelevant"

#### Scenario: 乱码结果

- **WHEN** 工具返回的文本被 `isGarbledText()` 判定为编码异常
- **THEN** checkResultQuality 返回 "garbled"
- **AND** 该结果不触发 autoRetry 计数
- **AND** 文件读取类工具直接降级为用户交互而非重试

#### Scenario: 乱码结果智能降级

- **WHEN** quality 为 "garbled" 且工具为文件读取类
- **THEN** agent loop 直接进入 responding 阶段
- **AND** 输出引导消息:"内容编码异常,无法自动解析。请尝试:1)粘贴文本内容 2)将文件另存为 UTF-8 编码后重新上传 3)发送截图"
