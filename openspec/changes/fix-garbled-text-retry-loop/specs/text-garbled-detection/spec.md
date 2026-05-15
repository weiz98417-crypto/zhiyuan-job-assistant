## ADDED Requirements

### Requirement: 乱码文本检测

系统 SHALL 提供 `isGarbledText()` 函数,检测文本是否因编码错误而呈现不可读的乱码状态。

#### Scenario: 检测 U+FFFD 替换字符

- **WHEN** 文本中 Unicode 替换字符(U+FFFD)密度 ≥ 0.5%
- **THEN** 判定为乱码,返回 true

#### Scenario: 检测 C1 控制字符污染

- **WHEN** 文本中 C1 控制字符(0x80-0x9F 码位范围)密度 ≥ 1%
- **THEN** 判定为乱码,返回 true

#### Scenario: 检测中文文本拉丁乱码

- **WHEN** 文本长度 > 100,且中文字符(CJK Unified Ideographs)占比 < 5%,且拉丁扩展区(Latin Extended)字符占比 > 30%
- **THEN** 判定为乱码,返回 true

#### Scenario: 正常中文文本通过

- **WHEN** 文本包含正常的中文内容(中文字符占比正常,无替换字符,无 C1 控制字符污染)
- **THEN** 判定为非乱码,返回 false

#### Scenario: 空文本通过

- **WHEN** 文本为空或仅含空白字符
- **THEN** 判定为非乱码,返回 false(空文本由 checkResultQuality 的 "empty" 分支处理)
