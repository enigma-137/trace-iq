import { AchievementView } from './types';
import { formatDate, metricCopy, progressPercent } from './metrics';

interface AchievementCardProps {
  achievement: AchievementView;
  onSelect: () => void;
}

export function AchievementCard({ achievement, onSelect }: AchievementCardProps) {
  const unlocked = achievement.unlocked;
  const copy = metricCopy(achievement.metric);
  const pct = progressPercent(achievement.progress, achievement.threshold);
  const remaining = Math.max(0, achievement.threshold - achievement.progress);

  const badge =
    unlocked
      ? 'h-16 w-16 shrink-0 rounded-full ring-2 ring-emerald-400/40 ring-offset-2 ring-offset-white dark:ring-offset-slate-950'
      : 'relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-dashed border-slate-500 dark:border-slate-700';
  const badgeImage =
    unlocked
      ? 'h-full w-full object-cover'
      : 'h-full w-full object-cover [filter:grayscale(0.9)_brightness(0.55)_contrast(0.9)]';

  const content = (
    <>
      <div className="flex items-start gap-4">
        <div className={badge}>
          <img className={badgeImage} src={achievement.badge} alt="" draggable={false} />
          {!unlocked ? (
            <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-950/40" aria-hidden />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400 dark:text-slate-500">
              {achievement.category}
            </span>
            {unlocked ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                Earned
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400 dark:border-slate-800 dark:text-slate-500">
                Locked
              </span>
            )}
          </div>
          <h3
            className={`mt-1.5 truncate text-base font-semibold ${
              unlocked ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-slate-400'
            }`}
          >
            {achievement.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-500 dark:text-slate-400">{achievement.description}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${
              unlocked ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-slate-600'
            }`}
            style={{ width: `${unlocked ? 100 : pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
          {unlocked ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">Earned · {formatDate(achievement.unlockedAt)}</span>
          ) : (
            <>
              <span className="font-medium text-neutral-500 dark:text-slate-400">{copy.progressText(achievement.progress, achievement.threshold)}</span>
              {remaining > 0 ? (
                <span className="text-neutral-400 dark:text-slate-500">{copy.remainingText(achievement.progress, achievement.threshold)}</span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );

  const base =
    'rounded-md border p-5 text-left transition ' +
    (unlocked
      ? 'cursor-pointer border-neutral-200 bg-white shadow-sm hover:ring-1 hover:ring-emerald-500/40 dark:border-slate-800/90 dark:bg-slate-900 dark:hover:ring-emerald-400/30'
      : 'border-neutral-200 bg-white/60 dark:border-slate-800/70 dark:bg-slate-950/50');

  if (unlocked) {
    return (
      <button type="button" className={base} onClick={onSelect} aria-label={`View ${achievement.title} and share it`}>
        {content}
      </button>
    );
  }

  return <div className={base}>{content}</div>;
}
