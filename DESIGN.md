<!-- SEED — re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: Career-Ops Frontend
description: 一个有温度的 AI 求职引擎界面——让求职从焦虑变掌控
---

# Design System: Career-Ops Frontend

## 1. Overview

**Creative North Star: "一页翻开的手帐"**

这不是一个仪表盘。这是一本你每天翻开的个人求职手帐。每一页有温度、有质感、有你今天的状态。AI 在背后默默工作，但用户感受到的是一位聪明的职场伙伴在手帐里圈出重点、写了批注。

系统拥抱有机形状和温暖的色彩——拒绝一切几何感和冰冷感。圆角像呼吸出来的，不是统一配置的。色彩像阳光穿过窗户纸，不是色轮上等距分布的。每一个数字背后有故事，每一个操作有回应，每一次打开有小小的仪式感。

这是产品型界面（用户来完成任务），但用品牌型的质感来承载（像翻一本精心排版的手帐）。效率在细节里，不在视觉攻击性里。

**Key Characteristics:**
- 有机圆角体系——半径从 8px 到 24px 不等，随层级上升变圆
- 手帐般的排版节奏——标题温暖醒目，正文安静舒适
- 大胆的色彩存在感——品牌色承载界面 30-50% 的视觉重量
- 编排过的入场动画——页面加载像翻页，卡片进入像被轻轻放在桌面上
- 拒绝一切"招聘App"的刻板印象——没有表格堆砌、没有广告感、没有企业蓝

## 2. Colors

**The Committed Rule.** 一个主色承担界面 30-50% 的色彩面积。它不是点缀——它是这个产品的身份。辅色淡雅柔和，服务于层级区分而非视觉竞争。

### Primary
- **[纸鸢朱砂 Zhusha]**（已定稿，0.11.0-D 样张 v2）: 主品牌色，#c0502f ≈ oklch(53% 0.135 40)。用于关键操作按钮（批准/发送）、主责徽章、审批卡描边、活跃旅程图标。求职语境里红色读作"喜"，黄色读作"黄了"——这是 0.11.0 去黄化的原因。Hover 用深一档 #a0411f；淡出层 zhusha-soft #f5e3da。

### Neutral
- **[暖白瓷 Porcelain Canvas]**（已定稿）: 页面底色 #f8f7f4；卡面 #fdfcf9；软面 #f2f0eb；hairline #e8e5de。
- **[墨色阶 Ink]**（已定稿）: ink #1f1e1b / body #3d3c38 / muted #76736b。
- **[深炭分析面 Analyst Dark]**（已定稿）: 分析面底 #191712、卡面 #22201a、边界 #35322a、字 #f2efe7 / #9b968a。工作台 = 分析面全屏态。

### Named Rules
**The One Voice Rule.** 主品牌色朱砂是界面唯一的"声音"。其他颜色只是"气息"——不用第二个高饱和色争夺注意力。语义 amber（--color-warn）仅用于风险警示，不作装饰。
**The Paper Baseline Rule.** 所有背景色必须从暖白瓷开始调暗或调亮。永远不出现纯白 (#fff) 或纯黑 (#000)。
**The De-AI Rules（去 AI 味四禁）.** 禁 emoji 作 UI 图标（Lucide 1.75px 线宽统一）、禁紫色渐变、禁玻璃卡墙、禁 Inter 字体。

## 3. Typography

**Display Font:** 霞鹜文楷（LXGW WenKai，lxgw-wenkai-webfont）——标题、大数字、品牌字。
**Body Font:** Noto Sans SC（系统回退 PingFang/雅黑），数字 tabular-nums。

**Character:** 标题像手写批注——圆润、有个性、有温度。正文清晰安静，不抢戏。两者之间的落差感就是"有人在手帐上写了标题"的感觉，而非"页面排版"。

### Hierarchy
- **Display** (600, clamp(2rem, 5vw, 3.5rem), 1.15): 评分大数字、页面主标题。最有个性的字体角色。
- **Headline** (500, 1.5rem, 1.3): 板块标题、卡片标题。
- **Title** (500, 1.125rem, 1.4): 列表项标题、面板标签。
- **Body** (400, 1rem, 1.6): 正文。最大行宽 68ch。
- **Label** (500, 0.8125rem, 1.3, letter-spacing 0.02em): 状态标签、数据标注。

### Named Rules
**The Handwriting Gap Rule.** Display 和 Body 之间的个性落差是有意设计的。Display 有"人味"（圆体手写感），Body 保持专业可读。两者落差越大，越像"有人在帮你批注"，而非"机器生成的报告"。

## 4. Elevation

编排过的动效意味着界面有"层"——但不是传统阴影。用**色彩的明暗渐变**代替阴影表示层级：更重要的东西颜色更暖、更亮。表面在静止时是平的（纸质感），内容块的"浮现"通过微妙的亮度变化和 Y 轴位移来表示。

**Shadow vocabulary 待实现时确定，设计方向：**
- 不使用深色 box-shadow。如果必须用阴影，它应该是暖色的，低对比度的，像纸张叠在一起的自然投影。
- 优先用背景色差值表示层级关系。

**The Flat-At-Rest Rule.** 所有表面静止时是平的。卡片不是"浮起来"的——它和背景是同一张纸，只是被暖色的区块区分开。深度变化只在交互时出现（hover 轻微上浮，拖拽时抬起）。

## 5. Components

<!-- Components omitted — seed mode, no code yet. -->

## 6. Do's and Don'ts

### Do:
- **Do** 让 Warm Amber Glow 大胆出现——它不需要躲在角落
- **Do** 使用有机的不规则间距——同一套间距体系，但不同语境下呼吸感不同
- **Do** 让圆角随层级上升变得更圆——内层元素 8px，外层容器 16-24px
- **Do** 用色彩温度表示信息层级——越重要的内容越暖
- **Do** 给每一个数字配上一句人话——"这个分数意味着你和岗位的匹配度很高"
- **Do** 动画编排有先后顺序——像书页翻开，不是所有东西同时出现

### Don't:
- **Don't** 让界面看起来像 Boss直聘/拉勾——没有橙色蓝色交错的表格、没有密集信息轰炸
- **Don't** 使用传统企业软件的组件默认值——禁止 Ant Design / Element UI 的蓝色主题、标准表格、标准导航栏
- **Don't** 出现 SaaS 模板感——禁止 Hero 区块 + 功能卡片网格 + CTA 按钮的流水线布局
- **Don't** 用开发者工具风——禁止暗黑主题、蓝紫色渐变、终端元素、代码块装饰
- **Don't** 出现政府/银行网站风——禁止灰色调为主的"安全"配色、禁止完全无动画
- **Don't** 使用纯白 (#fff) 或纯黑 (#000)
- **Don't** 使用侧边条纹边框（border-left/right > 1px 作为彩色强调）
- **Don't** 让卡片看起来都一样大——同样的 icon + heading + text 循环是 AI 的刻板输出
- **Don't** 让 AI 的痕迹露出来——没有 "✨ AI 生成" 标签，没有机器人图标
