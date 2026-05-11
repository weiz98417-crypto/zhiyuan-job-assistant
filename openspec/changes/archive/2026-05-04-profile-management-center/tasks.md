## 1. 锁定机制基础设施

- [x] 1.1 `ZhiyuanProfile` 类型扩展 `lockedFields: Record<string, string>` 字段（key=字段路径，value=锁定时间）
- [x] 1.2 `/api/data/profile` PATCH 端点支持写入 `source` 标记和 `lockedFields`
- [x] 1.3 `server-profile-engine.ts` 融合逻辑增加跳过锁定字段的检查
- [x] 1.4 创建 `useLockedFields` hook：读取/设置/清除单个字段的锁定状态

## 2. 目标岗位编辑

- [x] 2.1 创建 `EditGoalsDialog` 组件：Modal 表单（目标角色增删、薪资区间、底线条件增删）
- [x] 2.2 表单校验逻辑：角色名非空、薪资 min ≤ max、至少保留一个角色
- [x] 2.3 保存逻辑：调用 PATCH `/api/data/profile` 写入 goals_json + source 标记
- [x] 2.4 目标岗位卡片添加编辑按钮 + 锁定指示器
- [x] 2.5 取消/关闭表单逻辑

## 3. 核心技能编辑

- [x] 3.1 创建 `EditSkillsDialog` 组件：Modal 表单（技能列表、熟练度滑块、证据标签）
- [x] 3.2 添加技能：名称输入框 + 熟练度滑块（默认 50）+ 证据输入
- [x] 3.3 删除技能：确认弹窗 + 从列表移除
- [x] 3.4 熟练度滑块实时更新 + 修改标记（蓝色圆点）
- [x] 3.5 保存逻辑：调用 PUT `/api/data/profile` 写入 data_json.skills + source 标记
- [x] 3.6 锁定/解锁技能按钮
- [x] 3.7 核心技能卡片添加编辑按钮 + 锁定指示器

## 4. 进化轨迹交互

- [x] 4.1 创建 `HistoryDetailDialog` 组件：展示单条历史的完整 changes 列表
- [x] 4.2 实现「还原到此版本」功能：二次确认 → 用历史数据覆盖当前 → 追加 history 记录
- [x] 4.3 还原后自动锁定还原的字段
- [x] 4.4 进化轨迹条目改为可点击（cursor-pointer + hover 效果）

## 5. 数据操作区

- [x] 5.1 页面底部添加数据操作区 UI（分隔线 + 三个按钮）
- [x] 5.2 「从服务器同步」按钮：调 GET `/api/data/profile` → 刷新 DexieDB + 页面 → toast
- [x] 5.3 「导出画像 JSON」按钮：组装完整 ZhiyuanProfile → `downloadAsFile`
- [x] 5.4 「重置画像」按钮：二次确认对话框 → 调 DELETE 清空 → 页面回到空白

## 6. Profile 页面布局调整

- [x] 6.1 目标岗位卡片：添加编辑按钮 + 锁定指示器
- [x] 6.2 核心技能卡片：添加编辑按钮 + 锁定指示器 + 未锁定技能提示
- [x] 6.3 进化轨迹：条目改可点击，添加 hover 视觉反馈
- [x] 6.4 数据操作区：页面底部三个操作按钮
- [x] 6.5 编辑表单全部使用 Modal（点击外部关闭 + ESC 关闭）
- [x] 6.6 TypeScript 编译通过
- [x] 6.7 前端 build 通过
