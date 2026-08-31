"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

export default function NavItem({ href, label, icon: Icon, mobile = false }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={[
        mobile
          ? "group flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] px-1 py-1 transition-all duration-[var(--duration-normal)] ease-[var(--ease-out-expo)]"
          : "group flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] transition-all duration-[var(--duration-normal)] ease-[var(--ease-out-expo)]",
        isActive
          ? "bg-[var(--color-primary-soft)] text-[var(--color-text)] font-medium"
          : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-primary-muted)]",
      ].join(" ")}
    >
      <Icon
        size={20}
        className={
          isActive
            ? "text-[var(--color-primary)]"
            : "text-[var(--color-muted)] group-hover:text-[var(--color-text-soft)]"
        }
      />
      <span className={mobile ? "max-w-full truncate text-center text-[10px] leading-4" : "text-sm"}>{label}</span>
      {isActive && !mobile && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />
      )}
    </Link>
  );
}
