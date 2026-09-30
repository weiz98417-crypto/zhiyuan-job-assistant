"use client";

/**
 * WorkbenchShell — 全站唯一外壳(0.12.0 e-workbench-shell,ADR-0038)。
 *
 * interface: children(content)+ 可选 rail(求职旅程栏,经 useWorkbenchRail 注册)。
 * 实现内含:图标导航(工作台页,64px 可折叠持久化)/ 分组完整导航(普通页)/
 * 移动顶栏 + 底部 tab + Sheet / 用户与登出 / 主题切换 / 管理员抽屉 / ⌘K 命令面板。
 *
 * 纸鸢令牌唯一来源是 globals.css;本文件不写死色值。
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bot,
  ClipboardCheck,
  Command,
  Database,
  FileSearch,
  FileText,
  Home,
  ListTodo,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Scale,
  ScrollText,
  Search,
  Settings,
  Shield,
  Sun,
  Moon,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import NavItem from "./NavItem";
import CommandPalette from "./CommandPalette";
import { useTheme } from "@/components/providers/ThemeProvider";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { ToastProvider } from "@/lib/use-toast";
import BrandLogo from "@/components/brand/BrandLogo";
interface PaletteSession { id: number; title: string; }

interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member' | 'superadmin';
  status: string;
}

const TOP_ITEM = { href: "/", label: "今日手帳", icon: Home };
const BOTTOM_ITEM = { href: "/settings", label: "个人设置", icon: Settings };

const PHASE_GROUPS = [
  {
    label: "准备 · Prepare",
    items: [
      { href: "/agent", label: "纸鸢Agent", icon: Bot },
      { href: "/discover", label: "岗位发现", icon: Search },
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
      { href: "/compare", label: "Offer 评估", icon: Scale },
      { href: "/analytics", label: "数据分析", icon: BarChart3 },
    ],
  },
];

const ALL_ITEMS = [TOP_ITEM, ...PHASE_GROUPS.flatMap((g) => g.items), BOTTOM_ITEM];

const MOBILE_ITEMS = [TOP_ITEM, ...PHASE_GROUPS.flatMap((g) => g.items)].slice(0, 5);

const COLLAPSE_KEY = "workbench.rail.collapsed";

/* ── rail slot:页面把求职旅程栏 portal 进外壳的槽位容器 ── */

const WorkbenchRailContext = createContext<{
  railLabel: string;
  desktopSlot: HTMLDivElement | null;
  mobileSlot: HTMLDivElement | null;
  mobileRailOpen: boolean;
  setMobileRailOpen: (open: boolean) => void;
}>({
  railLabel: "求职旅程",
  desktopSlot: null,
  mobileSlot: null,
  mobileRailOpen: false,
  setMobileRailOpen: () => {},
});

/** 移动端抽屉控制(注册旅程栏之前就需要拿到)。 */
export function useWorkbenchRailControls() {
  const { setMobileRailOpen } = useContext(WorkbenchRailContext);
  return useMemo(() => ({ closeMobileRail: () => setMobileRailOpen(false) }), [setMobileRailOpen]);
}

/**
 * 旅程栏 portal:单实例渲染进外壳槽位(桌面栏位 + 移动 Sheet 同源),
 * 不经 props 复制节点,避免「新节点 → 外壳重渲染 → 新节点」的渲染环。
 */
export function WorkbenchRailPortal({ children }: { children: ReactNode }) {
  const { desktopSlot, mobileSlot, mobileRailOpen } = useContext(WorkbenchRailContext);
  const target = mobileRailOpen && mobileSlot ? mobileSlot : desktopSlot;
  if (!target) return null;
  return createPortal(children, target);
}

/* ── shell ── */

export default function WorkbenchShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const normalizedPathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const isWorkspacePage = normalizedPathname === "/agent";
  const isAnalystPage = ["/evaluate", "/compare", "/analytics"].some((prefix) => normalizedPathname.startsWith(prefix));
  const backdropOverlay = isAnalystPage ? "--workbench-analyst-overlay" : "--workbench-backdrop-overlay";
  const backdrop = normalizedPathname === "/agent"
    ? "/backgrounds/agent-journey.webp"
    : normalizedPathname.startsWith("/discover") || normalizedPathname.startsWith("/tracker")
      ? "/backgrounds/job-discovery.webp"
      : normalizedPathname.startsWith("/evaluate") || normalizedPathname.startsWith("/compare") || normalizedPathname.startsWith("/analytics")
        ? "/backgrounds/analyst.webp"
        : "/backgrounds/workbench.webp";

  const [user, setUser] = useState<UserInfo | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const adminDialogRef = useRef<HTMLDialogElement>(null);
  const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'superadmin'));

  // 图标折叠:仅工作台页生效,偏好持久化
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    // Q2 决策:工作台页默认图标栏;用户显式选择后跟随偏好。
    try {
      const stored = window.localStorage.getItem(COLLAPSE_KEY);
      setNavCollapsed(stored ? stored === "1" : isWorkspacePage);
    } catch {
      setNavCollapsed(isWorkspacePage);
    }
  }, [isWorkspacePage]);
  const toggleCollapsed = useCallback(() => {
    setNavCollapsed((current) => {
      const next = !current;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // 旅程栏槽位(仅工作台页;页面经 WorkbenchRailPortal 注入内容)
  const [desktopSlot, setDesktopSlot] = useState<HTMLDivElement | null>(null);
  const [mobileSlot, setMobileSlot] = useState<HTMLDivElement | null>(null);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const railLabel = "求职旅程";

  // ⌘K 命令面板(全局);会话数据在打开时获取
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSessions, setPaletteSessions] = useState<PaletteSession[] | undefined>(undefined);
  const openPalette = useCallback(() => {
    setPaletteSessions(undefined);
    setPaletteOpen(true);
    fetch("/api/sessions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setPaletteSessions(
        json?.success && Array.isArray(json.data)
          ? json.data.filter((s: { id?: unknown; title?: unknown }) => typeof s.id === "number").map((s: { id: number; title?: unknown }) => ({ id: s.id, title: typeof s.title === "string" ? s.title : "新对话" }))
          : [],
      ))
      .catch(() => setPaletteSessions([]));
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setUser(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const dialog = adminDialogRef.current;
    if (!dialog) return;
    if (adminOpen && !dialog.open) dialog.showModal();
    if (!adminOpen && dialog.open) dialog.close();
  }, [adminOpen, isAdmin]);

  // 路由变化时收起移动抽屉
  useEffect(() => {
    setMobileRailOpen(false);
  }, [normalizedPathname]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const railVisible = isWorkspacePage && desktopSlot !== null;

  const paletteElement = (
    <CommandPalette
      open={paletteOpen}
      onClose={() => setPaletteOpen(false)}
      onNewChat={() => router.push("/agent?newSession=1")}
      onSelectSession={(id) => router.push(`/agent?sessionId=${id}`)}
      sessions={paletteSessions}
    />
  );

  return (
    <WorkbenchRailContext.Provider value={{ railLabel, desktopSlot, mobileSlot, mobileRailOpen, setMobileRailOpen }}>
      <ToastProvider>
        <div
          className="flex min-h-full min-w-0 overflow-x-hidden"
          style={{
            backgroundImage: `linear-gradient(var(${backdropOverlay}), var(${backdropOverlay})), url('${backdrop}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
          }}
        >
          {/* ── 桌面侧导航 ── */}
          <aside
            className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-[var(--color-surface)] border-r border-[var(--color-border)] py-6 z-40 transition-[width] duration-[var(--duration-normal)] ${
              isWorkspacePage && navCollapsed ? "w-16 px-2" : "w-56 px-3"
            }`}
          >
            {/* Brand */}
            <div className={`mb-6 ${isWorkspacePage && navCollapsed ? "px-1 flex justify-center" : "px-4"}`}>
              {isWorkspacePage && navCollapsed ? <BrandLogo variant="mark" size="sm" /> : <BrandLogo variant="full" size="sm" />}
              {!(isWorkspacePage && navCollapsed) && (
                <p className="text-xs text-[var(--color-muted)] mt-2 pl-10">AI 求职助手</p>
              )}
            </div>

            {/* Nav items */}
            <nav aria-label="站点导航" className="flex-1 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
              {isWorkspacePage && navCollapsed ? (
                <IconNav
                  items={[TOP_ITEM, ...PHASE_GROUPS.flatMap((g) => g.items), BOTTOM_ITEM, { href: "/changelog", label: "版本更新", icon: ScrollText }]}
                  pathname={normalizedPathname}
                />
              ) : (
                <>
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
                  <NavItem href="/changelog" label="版本更新" icon={ScrollText} />
                </>
              )}
            </nav>

            {/* 工作台页:折叠开关 */}
            {isWorkspacePage && (
              <div className="border-t border-[var(--color-divider)] pt-3 mt-3">
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-pressed={navCollapsed}
                  title={navCollapsed ? "展开导航" : "收起导航"}
                  className={`flex items-center gap-3 w-full rounded-[var(--radius-md)] py-2 text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-primary-muted)] transition-colors ${isWorkspacePage && navCollapsed ? "px-2 justify-center" : "px-3"}`}
                >
                  {navCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                  {!navCollapsed && <span className="text-sm">收起导航</span>}
                </button>
              </div>
            )}

            {/* ⌘K 面板入口(桌面导航页脚,图标配/完整文案) */}
            <div className={`border-t border-[var(--color-divider)] pt-3 mt-3 ${isWorkspacePage && navCollapsed ? "px-1" : "px-3"}`}>
              <button
                type="button"
                onClick={openPalette}
                aria-label="⌘K 唤起命令面板"
                title="⌘K 唤起命令面板"
                className={`flex items-center gap-3 w-full rounded-[var(--radius-md)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-primary-muted)] transition-colors ${isWorkspacePage && navCollapsed ? "py-2 justify-center" : "px-3 py-2.5"}`}
              >
                <Command size={18} />
                {!(isWorkspacePage && navCollapsed) && <span className="text-sm">⌘K 唤起命令面板</span>}
              </button>
            </div>

            {/* User area + Theme toggle */}
            <div className="border-t border-[var(--color-divider)] pt-3 mt-3">
              {user && (
                <div className={isWorkspacePage && navCollapsed ? "px-1 mb-2" : "px-3 mb-2"}>
                  {isWorkspacePage && navCollapsed ? (
                    <>
                      <div className="w-9 h-9 mx-auto rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center text-xs font-bold" title={user.displayName}>
                        {user.displayName.charAt(0)}
                      </div>
                      <div className="flex flex-col items-center gap-1 mt-2">
                        {isAdmin && (
                          <button type="button" onClick={() => setAdminOpen(true)} aria-haspopup="dialog" aria-expanded={adminOpen} aria-controls="admin-drawer" title="管理后台" className="rounded-[var(--radius-sm)] p-2 text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]">
                            <Shield size={16} />
                          </button>
                        )}
                        <button onClick={handleLogout} title="退出登录" className="rounded-[var(--radius-sm)] p-2 text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50">
                          <LogOut size={16} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 px-2 py-1.5">
                        <div className="w-8 h-8 rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {user.displayName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[var(--color-text)] truncate">
                            {user.displayName}
                          </div>
                          <div className="text-[10px] text-[var(--color-muted)]">
                            {user.role === 'superadmin' ? '超级管理员' : user.role === 'admin' ? '管理员' : '成员'}
                          </div>
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setAdminOpen(true)}
                          aria-haspopup="dialog"
                          aria-expanded={adminOpen}
                          aria-controls="admin-drawer"
                          className="flex items-center gap-2 w-full px-2 py-1.5 mt-1 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)] transition-colors duration-[var(--duration-fast)]"
                        >
                          <Shield size={14} />
                          管理后台
                        </button>
                      )}
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 w-full px-2 py-1.5 mt-1 rounded-[var(--radius-sm)] text-xs text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50 transition-colors duration-[var(--duration-fast)]"
                      >
                        <LogOut size={14} />
                        退出登录
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Theme toggle */}
              <div className={isWorkspacePage && navCollapsed ? "px-1" : "px-3"}>
                <button
                  onClick={toggleTheme}
                  title={theme === "light" ? "深色模式" : "浅色模式"}
                  className={`flex items-center gap-3 w-full rounded-[var(--radius-md)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-primary-muted)] transition-colors duration-[var(--duration-fast)] ${isWorkspacePage && navCollapsed ? "py-2 justify-center" : "px-3 py-2.5"}`}
                >
                  {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
                  {!(isWorkspacePage && navCollapsed) && (
                    <span className="text-sm">
                      {theme === "light" ? "深色模式" : "浅色模式"}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </aside>

          {/* ── 主内容区:工作台页 = 旅程栏 + 内容 的行内双栏 ── */}
          <main className={`min-w-0 flex-1 overflow-x-hidden flex flex-col lg:flex-row ${navMarginClass(isWorkspacePage, navCollapsed)}`}>
            {isWorkspacePage && (
              <aside
                data-testid="workbench-journey-rail"
                aria-label={railLabel}
                className="hidden lg:flex flex-col min-h-0 w-[220px] flex-shrink-0 border-r border-[var(--color-divider)] bg-[var(--color-surface-soft)]/90 overflow-hidden"
              >
                <div ref={setDesktopSlot} className="flex min-h-0 flex-1 flex-col overflow-hidden" />
              </aside>
            )}
            <header className="flex min-h-14 w-full flex-shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 lg:hidden">
              <button
                type="button"
                onClick={() => setMobileRailOpen(true)}
                aria-label="打开菜单"
                aria-expanded={mobileRailOpen}
                className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-text)]"
              >
                <Menu size={18} />
                菜单
              </button>
              <BrandLogo variant="full" size="xs" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPalette}
                  aria-label="打开命令面板"
                  className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-text)]"
                >
                  <Command size={16} />
                  ⌘K
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setAdminOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={adminOpen}
                    aria-controls="admin-drawer"
                    className="flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]"
                  >
                    <Shield size={16} />
                    管理
                  </button>
                )}
              </div>
            </header>
            <div className="min-w-0 flex-1 overflow-x-hidden flex flex-col">
            <motion.div
              key="page-content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.19, 1, 0.22, 1] }}
              className={`h-full min-w-0 overflow-x-hidden flex flex-col px-[var(--space-page)] py-[var(--space-section)] pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-[var(--space-section)] ${
                isWorkspacePage ? "w-full max-w-none" : "max-w-[1600px]"
              }`}
            >
              {children}
            </motion.div>
            </div>
          </main>

          {/* ── 移动底部 tab ── */}
          <nav aria-label="快捷导航" className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] flex justify-around pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] px-1 z-50">
            {MOBILE_ITEMS.map((item) => (
              <NavItem key={item.href} {...item} mobile />
            ))}
          </nav>

          {/* ── 管理员抽屉 ── */}
          {isAdmin && (
            <dialog
              id="admin-drawer"
              ref={adminDialogRef}
              onClose={() => setAdminOpen(false)}
              onClick={(event) => {
                if (event.target === event.currentTarget) setAdminOpen(false);
              }}
              aria-labelledby="admin-drawer-title"
              className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-sm border-l border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] shadow-[var(--shadow-lg)] backdrop:bg-black/40"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
                  <h2 id="admin-drawer-title" className="text-base font-semibold">管理后台</h2>
                  <button type="button" onClick={() => setAdminOpen(false)} aria-label="关闭管理后台" className="rounded-[var(--radius-sm)] p-2 text-[var(--color-muted)] hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-text)]">
                    <X size={18} />
                  </button>
                </div>
                <nav aria-label="管理后台" className="flex-1 space-y-1 overflow-y-auto p-3">
                  <a href="/admin/agent-runs" className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]">
                    <Bot size={18} />Agent 运行监控
                  </a>
                  <a href="/admin/agent-reviews" className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]">
                    <ClipboardCheck size={18} />Agent 复盘治理
                  </a>
                  <a href="/admin/users" className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]">
                    <Shield size={18} />用户管理
                  </a>
                  <a href="/admin/insights" className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]">
                    <TrendingUp size={18} />团队洞察
                  </a>
                  <a href="/admin/memory" className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]">
                    <Database size={18} />记忆治理
                  </a>
                  {user?.role === 'superadmin' && (
                    <a href="/admin/security-events" className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-3 text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary-muted)]">
                      <ScrollText size={18} />安全审计
                    </a>
                  )}
                </nav>
              </div>
            </dialog>
          )}

          {/* ── 移动菜单 Sheet:完整导航 + 旅程栏 ── */}
          {mobileRailOpen && (
            <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="导航与旅程">
              <div className="absolute inset-0 bg-black/40" onClick={() => setMobileRailOpen(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-[min(300px,85vw)] bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col">
                <div className="flex items-center justify-between border-b border-[var(--color-divider)] px-4 py-3">
                  <BrandLogo variant="full" size="sm" />
                  <button type="button" onClick={() => setMobileRailOpen(false)} aria-label="关闭菜单" className="rounded-[var(--radius-sm)] p-2 text-[var(--color-muted)] hover:bg-[var(--color-primary-muted)]">
                    <X size={18} />
                  </button>
                </div>
                <nav aria-label="站点导航" className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
                  {ALL_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileRailOpen(false)}
                      className={`flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm transition-colors ${
                        (normalizedPathname === item.href || normalizedPathname.startsWith(item.href + "/"))
                          ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-hover)] font-medium"
                          : "text-[var(--color-text-soft)] hover:bg-[var(--color-surface-soft)]"
                      }`}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </Link>
                  ))}
                  <Link href="/changelog" onClick={() => setMobileRailOpen(false)} className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm text-[var(--color-text-soft)] hover:bg-[var(--color-surface-soft)]">
                    <ScrollText size={16} />
                    版本更新
                  </Link>
                </nav>
                <div
                  ref={setMobileSlot}
                  className="border-t border-[var(--color-divider)] flex flex-col min-h-0 overflow-hidden"
                  style={{ maxHeight: "45%" }}
                />
                <div className="border-t border-[var(--color-divider)] px-3 py-2 flex items-center gap-2">
                  <button type="button" onClick={openPalette} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-text)]">
                    <Command size={14} />命令面板
                  </button>
                  <button type="button" onClick={toggleTheme} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-primary-muted)] hover:text-[var(--color-text)]">
                    {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
                    {theme === "light" ? "深色" : "浅色"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        {paletteElement}
      </ToastProvider>
    </WorkbenchRailContext.Provider>
  );
}

function navMarginClass(isWorkspacePage: boolean, navCollapsed: boolean): string {
  if (isWorkspacePage) {
    return navCollapsed ? "lg:ml-16" : "lg:ml-56";
  }
  return "lg:ml-56";
}

function IconNav({ items, pathname }: { items: Array<{ href: string; label: string; icon: typeof Home }>; pathname: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={`w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center transition-colors ${
              active
                ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-hover)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-primary-muted)]"
            }`}
          >
            <item.icon size={18} />
          </Link>
        );
      })}
    </div>
  );
}
