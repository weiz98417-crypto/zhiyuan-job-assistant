import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="text-[var(--color-muted)] mb-4 opacity-50">{icon}</div>
      <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">{title}</h3>
      <p className="text-xs text-[var(--color-muted)] mb-6 max-w-xs">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--color-primary)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
