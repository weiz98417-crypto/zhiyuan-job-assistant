import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = '加载失败，请检查网络后重试',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <AlertTriangle size={36} className="text-[var(--color-muted)] mb-4 opacity-60" />
      <p className="text-sm text-[var(--color-text-soft)] mb-6">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-soft)] text-xs font-medium hover:bg-[var(--color-bg)] transition-colors"
        >
          重试
        </button>
      )}
    </div>
  );
}
