import { AchievementView } from './types';
import { formatDate } from './metrics';

export function AchievementShareCard({ achievement }: { achievement: AchievementView }) {
  return (
    <div className="relative w-[360px] max-w-full select-none overflow-hidden rounded-2xl border border-slate-700/60 bg-[#0b0d12] p-6 text-left shadow-2xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.16),transparent_55%)]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <img className="h-6 w-auto" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
          <span className="rounded border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">
            Achievement
          </span>
        </div>

        <div className="mt-8 flex justify-center">
          <img className="h-36 w-36" src={achievement.badge} alt={achievement.title} />
        </div>

        <p className="mt-6 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500">{achievement.category}</p>
        <h3 className="mt-2 text-center text-2xl font-bold tracking-tight text-white">{achievement.title}</h3>
        <p className="mt-3 text-center text-sm leading-6 text-slate-400">{achievement.description}</p>

        <div className="mt-6 h-px w-full bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
        <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span className="uppercase tracking-[0.18em]">Earned</span>
          <span className="font-semibold text-slate-200">{formatDate(achievement.unlockedAt)}</span>
        </div>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-slate-600">traceiq.run</p>
      </div>
    </div>
  );
}
