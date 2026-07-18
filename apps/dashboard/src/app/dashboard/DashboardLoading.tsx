import { DashboardShell } from './DashboardShell';
import { Skeleton, SkeletonCard } from '@/components/Skeleton';

type Variant = 'stats' | 'table' | 'chart' | 'form';

interface DashboardLoadingProps {
  active: string;
  title: string;
  variant?: Variant;
}

/** Route-level loading fallback: keeps the shell visible and shows skeletons in the content. */
export function DashboardLoading({ active, title, variant = 'stats' }: DashboardLoadingProps) {
  return (
    <DashboardShell active={active} title={title}>
      {variant === 'stats' ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <ChartBlock />
            <ListBlock />
          </div>
        </>
      ) : null}

      {variant === 'chart' ? (
        <>
          <div className="mb-6 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="grid gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          </div>
          <ChartBlock />
        </>
      ) : null}

      {variant === 'table' ? (
        <div className="rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {variant === 'form' ? (
        <div className="grid gap-4 rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}

function ChartBlock() {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-56 w-full" />
    </div>
  );
}

function ListBlock() {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <Skeleton className="h-3 w-28" />
      <div className="mt-4 grid gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
