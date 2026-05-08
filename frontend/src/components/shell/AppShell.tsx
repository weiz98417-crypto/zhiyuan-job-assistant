"use client";

import type { ReactNode } from "react";
import {
  Home,
  FileSearch,
  ListTodo,
  Scale,
  FileText,
  MessageSquare,
  BarChart3,
  Search,
  Settings,
  Sun,
  Moon,
  Bot,
  User,
} from "lucide-react";
import NavItem from "./NavItem";
import { useTheme } from "@/components/providers/ThemeProvider";
import { motion } from "framer-motion";

const TOP_ITEM = { href: "/", label: "今日手帳", icon: Home };
const BOTTOM_ITEM = { href: "/settings", label: "个人设置", icon: Settings };

const PHASE_GROUPS = [
  {
    label: "准备 · Prepare",
    items: [
      { href: "/agent", label: "纸鸢Agent", icon: Bot },
      { href: "/discover", label: "职位发现", icon: Search },
      { href: "/evaluate", label: "JD 管理", icon: FileSearch },
      { href: "/profile", label: "求职画像", icon: User },
      { href: "/cv", label: "简历管理", icon: FileText },
    ],
  },
  {
    label: "行动 · Act",
    items: [
      { href: "/tracker", label: "投递追踪", icon: ListTodo },
      { href: "/interview", label: "面试准备", icon: MessageSquare },
    ],
  },
  {
    label: "收尾 · Close",
    items: [
      { href: "/compare", label: "Offer 对比", icon: Scale },
      { href: "/analytics", label: "数据分析", icon: BarChart3 },
    ],
  },
];

const MOBILE_ITEMS = [
  TOP_ITEM,
  ...PHASE_GROUPS.flatMap((g) => g.items),
].slice(0, 5);

export default function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-full">
      {/* Desktop Side Nav — the "table of contents" of the journal */}
      <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-[var(--color-surface)] border-r border-[var(--color-border)] px-3 py-6">
        {/* Brand */}
        <div className="px-4 mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--color-text)]">
            筝筝纸鸢
          </h1>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            AI 求职手帳
          </p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col gap-1 overflow-y-auto">
          <NavItem key={TOP_ITEM.href} {...TOP_ITEM} />

          {PHASE_GROUPS.map((group, gi) => (
            <div key={group.label}>
              <div className="mt-3 mb-1 px-4">
                <hr className="border-[var(--color-divider)] mb-2" />
                <span className="text-[10px] font-medium tracking-wide uppercase text-[var(--color-muted)]">
                  {group.label}
                </span>
              </div>
              {group.items.map((item) => (
                <NavItem key={item.href} {...item} />
              ))}
              {gi === PHASE_GROUPS.length - 1 && (
                <div className="mt-3 px-4">
                  <hr className="border-[var(--color-divider)]" />
                </div>
              )}
            </div>
          ))}

          <NavItem key={BOTTOM_ITEM.href} {...BOTTOM_ITEM} />
        </nav>

        {/* Theme toggle & footer */}
        <div className="px-4 pt-4 border-t border-[var(--color-divider)]">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-[var(--radius-md)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-primary-muted)] transition-colors duration-[var(--duration-fast)]"
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            <span className="text-sm">
              {theme === "light" ? "深色模式" : "浅色模式"}
            </span>
          </button>
        </div>
      </aside>

      {/* Main content area — the "pages" of the journal */}
      <main className="flex-1 lg:ml-56">
        <motion.div
          key="page-content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
          className="h-full flex flex-col px-[var(--space-page)] py-[var(--space-section)] max-w-[1600px]"
        >
          {children}
        </motion.div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex justify-around py-2 px-1 z-50">
        {MOBILE_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>
      {/* Mobile bottom padding */}
      <div className="lg:hidden h-16" />
    </div>
  );
}
