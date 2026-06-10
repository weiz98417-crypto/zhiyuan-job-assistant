"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere] ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="my-3 w-full max-w-full min-w-0 overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-surface)]">
              <table className="w-max min-w-full border-collapse text-left text-xs leading-relaxed">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--color-primary-muted)] text-[var(--color-text)]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--color-divider)] px-3 py-2 align-top font-semibold whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--color-divider)] px-3 py-2 align-top text-[var(--color-text-soft)] [overflow-wrap:anywhere]">
              {children}
            </td>
          ),
          h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-bold leading-snug text-[var(--color-text)] first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-5 text-lg font-bold leading-snug text-[var(--color-text)] first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-semibold leading-snug text-[var(--color-text)] first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-semibold leading-snug text-[var(--color-text)] first:mt-0">{children}</h4>,
          p: ({ children }) => <p className="my-2 leading-relaxed text-[var(--color-text-soft)] first:mt-0 last:mb-0 [overflow-wrap:anywhere]">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1.5 pl-5 first:mt-0 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5 first:mt-0 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-relaxed text-[var(--color-text-soft)] marker:text-[var(--color-muted)] [overflow-wrap:anywhere] [&>p]:my-0">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-3 border-[var(--color-primary)] bg-[var(--color-primary-muted)] px-3 py-2 text-[var(--color-text-soft)] first:mt-0 last:mb-0">
              {children}
            </blockquote>
          ),
          strong: ({ children }) => <strong className="font-semibold text-[var(--color-text)]">{children}</strong>,
          em: ({ children }) => <em className="text-[var(--color-text-soft)]">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target={href?.startsWith("http") ? "_blank" : undefined}
              rel={href?.startsWith("http") ? "noreferrer" : undefined}
              className="font-medium text-[var(--color-primary)] underline-offset-2 hover:underline [overflow-wrap:anywhere]"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="my-4 border-0 border-t border-[var(--color-divider)]" />,
          code: ({ children }) => (
            <code className="rounded bg-[var(--color-bg)] px-1 py-0.5 font-mono text-[0.9em] text-[var(--color-text)] [overflow-wrap:anywhere]">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="my-3 max-w-full overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-[var(--color-bg)] p-3 text-xs leading-relaxed">
              {children}
            </pre>
          ),
        }}
      >
        {content || ""}
      </ReactMarkdown>
    </div>
  );
}
