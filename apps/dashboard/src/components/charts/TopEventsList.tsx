import { formatEventName } from '@/lib/metrics';

interface TopEvent {
  eventName: string;
  total: number;
}

interface TopEventsListProps {
  events: TopEvent[];
}

export function TopEventsList({ events }: TopEventsListProps) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-500">No events captured in the last 30 days.</p>;
  }

  const maxTotal = Math.max(1, ...events.map((event) => event.total));

  return (
    <ul className="grid gap-2">
      {events.map((event) => (
        <li key={event.eventName} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200"
              title={event.eventName}
            >
              {formatEventName(event.eventName)}
            </span>
            <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">{event.total.toLocaleString()}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${(event.total / maxTotal) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}


