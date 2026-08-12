import { formatEventName } from '@/lib/metrics';

interface RankedItem {
  label: string;
  total: number;
}

interface RankedListProps {
  items: RankedItem[];
  emptyLabel?: string;
  mono?: boolean;
}

export function RankedList({ items, emptyLabel = 'No data yet.', mono = false }: RankedListProps) {
  const meaningful = items.filter((item) => item.label && item.label !== 'unknown');
  const list = meaningful.length > 0 ? items : [];

  if (list.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-500">{emptyLabel}</p>;
  }

  const maxTotal = Math.max(1, ...list.map((item) => item.total));

  return (
    <ul className="grid gap-2">
      {list.map((item) => (
        <li key={item.label} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={`truncate text-sm text-neutral-800 dark:text-neutral-200 ${mono ? 'font-mono' : ''}`}
              title={item.label}
            >
              {formatEventName(item.label)}
            </span>
            <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">{item.total.toLocaleString()}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${(item.total / maxTotal) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}


