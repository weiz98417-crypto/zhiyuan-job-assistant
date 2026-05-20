export default function Skeleton({ lines = 5, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 animate-pulse ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-4 bg-[var(--color-divider)] rounded"
          style={{ width: i === lines - 1 && lines > 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}
