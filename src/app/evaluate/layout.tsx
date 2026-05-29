"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Bookmark, BarChart3 } from "lucide-react";

const TABS = [
  { href: "/evaluate", label: "评估", icon: FileText },
  { href: "/evaluate/jds", label: "JD 库", icon: Bookmark },
  { href: "/evaluate/reports", label: "报告", icon: BarChart3 },
];

export default function EvaluateLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div>
      {/* Sub-navigation tabs */}
      <nav className="flex items-center gap-1 mb-6 -mt-2">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href || (tab.href !== "/evaluate" && pathname.startsWith(tab.href));
          const Icon = tab.icon;
          return (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm transition-colors ${
                isActive
                  ? "bg-[var(--color-primary-muted)] text-[var(--color-primary)] font-medium"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)]"
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
