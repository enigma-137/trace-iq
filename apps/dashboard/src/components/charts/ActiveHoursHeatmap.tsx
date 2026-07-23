const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ActiveHoursHeatmap({ matrix }: { matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[32px_repeat(24,1fr)] gap-1 text-[10px] text-neutral-400 dark:text-neutral-500">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center">
              {hour % 3 === 0 ? hour : ''}
            </span>
          ))}
        </div>

        {matrix.map((row, dow) => (
          <div key={dow} className="mt-1 grid grid-cols-[32px_repeat(24,1fr)] items-center gap-1">
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{DAYS[dow]}</span>
            {row.map((value, hour) => {
              const intensity = value / max;
              return (
                <div
                  key={hour}
                  title={`${DAYS[dow]} ${hour}:00 — ${value}`}
                  className="aspect-square rounded-sm bg-blue-600 dark:bg-blue-500"
                  style={{ opacity: value === 0 ? 0.06 : 0.15 + intensity * 0.85 }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
