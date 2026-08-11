'use client';

import { useState } from 'react';
import { AchievementView } from './types';
import { AchievementCard } from './AchievementCard';
import { AchievementDialog } from './AchievementDialog';

export function AchievementsBoard({ achievements }: { achievements: AchievementView[] }) {
  const [selected, setSelected] = useState<AchievementView | null>(null);
  const earned = achievements.filter((achievement) => achievement.unlocked).length;

  const groups: Array<{ category: string; items: AchievementView[] }> = [];
  const grouped = new Map<string, AchievementView[]>();
  for (const achievement of achievements) {
    const list = grouped.get(achievement.category) ?? [];
    list.push(achievement);
    grouped.set(achievement.category, list);
  }
  for (const [category, items] of grouped) {
    groups.push({ category, items });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-600 dark:border-slate-800 dark:text-slate-300">
          {earned} of {achievements.length} unlocked
        </span>
        <span className="text-sm text-neutral-500 dark:text-slate-400">
          Achievements unlock for the whole workspace as it tracks usage — click an earned badge to download a share card.
        </span>
      </div>

      {groups.length === 0 ? (
        <section className="rounded-md border border-neutral-200 bg-white p-10 text-center text-sm text-neutral-500 dark:border-slate-800/90 dark:bg-slate-950 dark:text-slate-500">
          No achievements yet. The catalogue is being built.
        </section>
      ) : (
        <div className="grid gap-8">
          {groups.map((group) => {
            const groupEarned = group.items.filter((achievement) => achievement.unlocked).length;
            return (
              <section key={group.category}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400 dark:text-slate-500">
                    {group.category}
                  </h2>
                  <span className="text-xs text-neutral-400 dark:text-slate-500">
                    {groupEarned} of {group.items.length}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((achievement) => (
                    <AchievementCard key={achievement.id} achievement={achievement} onSelect={() => setSelected(achievement)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AchievementDialog achievement={selected} onClose={() => setSelected(null)} />
    </>
  );
}
