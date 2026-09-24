import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ScrollText } from "lucide-react";
import { HandwritingTitle } from "@/components/design";

export const metadata: Metadata = {
  title: "版本更新 — 筝筝纸鸢",
  description: "查看筝筝纸鸢的版本更新与即将上线的改进。",
};

const upcomingChanges = [
  {
    title: "全新界面:纸鸢配色与双面板",
    description: "界面换上纸鸢朱砂新配色,去掉旧黄色主题;报告和证据材料移入独立的\"分析台\"面板,聊天界面保持清爽;左侧旅程栏一眼看清每段求职任务的进度。",
  },
  {
    title: "任务响应更快、更透明",
    description: "发出任务后几乎立即开始执行并给出回执,不再出现\"点了没反应\";正在理解、执行、核对到输出的每个阶段都有清晰的进度提示,委派和交接也以卡片形式可见。",
  },
  {
    title: "对话记录不再闪烁或错乱",
    description: "刷新页面或切换会话时,对话以已保存的记录为准合并显示,正在生成的内容不会被覆盖、重复或回退。",
  },
  {
    title: "输入与滚动体验升级",
    description: "输入框随内容自动伸缩,Enter 发送、Shift+Enter 换行,支持 Ctrl+V 粘贴截图;长对话自动停留在最新消息,向上翻阅时不会被强行拉回底部。",
  },
  {
    title: "高风险操作统一审批卡",
    description: "写入画像、保存简历等敏感操作会弹出统一的批准/拒绝卡片,处理结果和历史状态一目了然。",
  },
  {
    title: "统一 AI 模型与图片识别",
    description: "回答、JD 和简历识图及岗位页提取统一使用 deepseek-flash；长图分段识别，部分图片超时仍可先分析已读内容。",
  },
  {
    title: "JD 与简历图片评估",
    description: "简历截图或 PDF 没有对应 JD 时，也可以直接获得内容、结构和可读性建议；图片读不清时，可以在原对话粘贴文字继续。",
  },
  {
    title: "对话与任务状态",
    description: "消息确认超时后先核实是否已送达，减少重复执行；切换对话时只显示当前对话的任务，发送失败时保留输入以便重试。",
  },
  {
    title: "JD 匹配范围",
    description: "JD 默认对照简历；明确要求不匹配后，同一份 JD 的重新分析会延续该要求，换一份 JD 时恢复默认。",
  },
  {
    title: "界面体验",
    description: "管理入口收进侧边抽屉，并新增版本更新入口；优化对话滚动、历史栏和任务停止操作。",
  },
];

export default function ChangelogPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-8">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-[var(--color-primary)]">
          <ScrollText size={18} />
          产品动态
        </div>
        <HandwritingTitle as="h1">版本更新</HandwritingTitle>
        <p className="text-sm leading-7 text-[var(--color-text-soft)]">
          这里记录已经确认的版本信息，以及正在准备上线的改进。
        </p>
      </header>

      <section aria-labelledby="upcoming-version" className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="upcoming-version" className="text-xl font-semibold text-[var(--color-text)]">V0.11.0</h2>
          <span className="rounded-full bg-[var(--color-primary-muted)] px-3 py-1 text-xs font-medium text-[var(--color-text-soft)]">待发布</span>
        </div>
        <p className="mt-2 text-sm text-[var(--color-text-soft)]">以下改进正在本地验证，线上尚未更新。</p>
        <div className="mt-5 divide-y divide-[var(--color-divider)]">
          {upcomingChanges.map((change) => (
            <div key={change.title} className="py-4 first:pt-0 last:pb-0">
              <h3 className="font-medium text-[var(--color-text)]">{change.title}</h3>
              <p className="mt-1 text-sm leading-7 text-[var(--color-text-soft)]">{change.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="current-version" className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="current-version" className="text-xl font-semibold text-[var(--color-text)]">V0.10.6</h2>
          <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-soft)]">当前线上版本</span>
        </div>
        <p className="mt-3 text-sm leading-7 text-[var(--color-text-soft)]">
          已确认的线上版本。此前版本的逐项更新记录正在核对，确认后会补充在这里。
        </p>
      </section>

      <Link href="/agent" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline">
        返回纸鸢 Agent
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
