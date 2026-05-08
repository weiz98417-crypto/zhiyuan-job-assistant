## ADDED Requirements

### Requirement: CV 页面上传入口

CV 管理页面 SHALL 提供简历文件上传入口，支持选择文件和拖拽上传。

#### Scenario: 上传按钮

- **WHEN** 用户访问 `/cv` 页面
- **THEN** 页面 SHALL 显示"导入简历"按钮
- **AND** 点击后弹出系统文件选择器
- **AND** 接受格式：jpg, png, webp, pdf, docx, md, txt

#### Scenario: 解析进度展示

- **WHEN** 用户选择文件后
- **THEN** 按钮 SHALL 变为加载态（"解析中..."）
- **AND** 解析完成后自动将结果填入对应栏位
- **AND** 用户可编辑后再保存

#### Scenario: 解析失败处理

- **WHEN** 文件解析失败
- **THEN** SHALL 显示错误提示（具体错误原因）
- **AND** 不影响已有栏位内容

#### Scenario: 拖拽上传

- **WHEN** 用户将文件拖拽到 CV 页面
- **THEN** 页面 SHALL 显示拖拽区域高亮
- **AND** 释放后触发与点击按钮相同的上传流程
