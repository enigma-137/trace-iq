export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-200 dark:bg-slate-800/80 ${className}`} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-md border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800/90 dark:bg-slate-950 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.08),transparent_34%)] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.12),transparent_34%)]" />
      <div className="relative">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-3 h-7 w-24" />
        <Skeleton className="mt-2 h-3 w-16" />
      </div>
    </div>
  );
}