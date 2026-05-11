## 1. 数据模型 & 映射

- [x] 1.1 扩展 `UserProfile` 类型，新增 `narrative?`、`archetype?`、`preferences?`、`constraints?` 字段
- [x] 1.2 修改 explore page `handleSave`：将 `ProfileData` 正确映射到 `UserProfile` 格式（targetRoles 转换、superpowers 去重合并、narrative/archetype/preferences/constraints 写入）
- [x] 1.3 TypeScript 类型检查通过

## 2. 设置页可视化

- [x] 2.1 设置页"职业定位"上方新增"求职画像"卡片，展示 archetype / targetRoles / skills / preferences / constraints / narrative
- [x] 2.2 设置页"职业定位"区块自动回填 explore 归档数据（headline←narrative, targetRoles, superpowers）
- [x] 2.3 无归纳数据时隐藏画像卡片

## 3. 保存反馈

- [x] 3.1 保存成功后按钮旁展示"查看档案 →"快捷链接
- [x] 3.2 重复保存时短暂显示已保存状态后恢复按钮
