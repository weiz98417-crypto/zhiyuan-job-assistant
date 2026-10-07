import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ScrollText } from "lucide-react";
import { PageHeading } from "@/components/ui/workbench-primitives";
import appPackage from "../../../package.json";
import { releaseNotes } from "./release-notes";

export const metadata: Metadata = {
  title: "版本更新 — 纸鸢 Agent",
  description: "查看纸鸢 Agent 的当前版本与历史更新。",
};

type ChangelogPageProps = {
  searchParams: Promise<{ version?: string | string[] }>;
};

export default async function ChangelogPage({ searchParams }: ChangelogPageProps) {
  const { version } = await searchParams;
  const selectedVersion = typeof version === "string" ? version : appPackage.version;
  const requestedRelease = releaseNotes.find((release) => release.version === selectedVersion);
  const selectedRelease = requestedRelease
    ?? releaseNotes.find((release) => release.version === appPackage.version)
    ?? releaseNotes[0];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-8">
      <header>
        <PageHeading
          as="h1"
          meta={
            <span className="flex items-center gap-2 text-[var(--color-primary)]">
              <ScrollText size={18} />
              产品动态
            </span>
          }
          title="版本更新"
        />
        <p className="text-sm leading-7 text-[var(--color-text-soft)] mt-3">
          选择版本查看完整记录。开发整合版本会单独标明，未核实的历史变更不会补写。
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <aside aria-label="版本选择" className="surface-panel rounded-[var(--radius-lg)] p-5 sm:p-6 lg:sticky lg:top-8 lg:col-start-2 lg:row-start-1">
          <h2 className="text-base font-semibold text-[var(--color-text)]">历史版本</h2>
          <nav aria-label="选择版本" className="mt-4">
            <ol className="space-y-2">
              {releaseNotes.map((release) => {
                const isSelected = release.version === selectedRelease.version;
                return (
                  <li key={release.version}>
                    <Link
                      href={`/changelog?version=${release.version}`}
                      aria-current={isSelected ? "page" : undefined}
                      className={`block rounded-[var(--radius-md)] border px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] ${isSelected
                        ? "border-[var(--color-primary)] bg-[var(--color-primary-muted)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-raised)]/50 hover:border-[var(--color-primary)]"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--color-text)]">V{release.version}</span>
                        <span className="text-xs text-[var(--color-text-soft)]">
                          {release.version === appPackage.version ? "当前线上" : release.stage === "development" ? "开发整合" : "已发布"}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--color-text-soft)]">{release.summary}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>

        <section aria-labelledby="selected-version" className="surface-panel rounded-[var(--radius-lg)] p-5 sm:p-7 lg:col-start-1 lg:row-start-1">
          {!requestedRelease && typeof version === "string" && (
            <p role="status" className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-raised)]/70 px-4 py-3 text-sm text-[var(--color-text-soft)]">
              未找到该版本的更新记录，已显示当前版本。
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="selected-version" className="text-2xl font-semibold text-[var(--color-text)]">V{selectedRelease.version}</h2>
            <span className="rounded-full bg-[var(--color-primary-muted)] px-3 py-1 text-xs font-medium text-[var(--color-primary)]">
              {selectedRelease.version === appPackage.version ? "当前线上版本" : selectedRelease.stage === "development" ? "开发整合阶段" : "历史生产版本"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-7 text-[var(--color-text-soft)]">{selectedRelease.summary}</p>
          {selectedRelease.sections.map((section) => (
            <div key={section.title} className="mt-6 border-t border-[var(--color-divider)] pt-5">
              <h3 className="text-base font-semibold text-[var(--color-text)]">{section.title}</h3>
              <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
                {section.changes.map((change) => (
                  <div key={change.title ?? change.description} className="border-t border-[var(--color-divider)] py-4 first:border-t-0 sm:[&:nth-child(2)]:border-t-0">
                    {change.title && <h4 className="font-medium text-[var(--color-text)]">{change.title}</h4>}
                    <p className="text-sm leading-7 text-[var(--color-text-soft)]">{change.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {selectedRelease.caveat && (
            <p className="mt-5 border-t border-[var(--color-divider)] pt-4 text-sm leading-7 text-[var(--color-text-soft)]">
              {selectedRelease.caveat}
            </p>
          )}
        </section>
      </div>

      <Link href="/agent" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline">
        返回纸鸢 Agent
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}
