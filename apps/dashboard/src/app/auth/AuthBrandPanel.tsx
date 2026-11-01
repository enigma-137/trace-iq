import Link from 'next/link';

const POINTS = ['Revenue & GTV as a first-class metric', 'Funnels with per-step drop-off', 'SDKs for web, server & mobile'];

/** Left-hand brand panel shared by every auth page. Always light: white, blue and orange. */
export function AuthBrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-[#d4e2f2] bg-gradient-to-br from-[#e5f3ff] via-white to-[#fff0e4] p-12 text-[#101715] lg:flex">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(#245beb33 1px, transparent 1px)',
          backgroundSize: '22px 22px'
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#245beb]/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-[#ee8034]/15 blur-3xl" />

      <Link className="relative inline-flex" href="/" aria-label="TraceIQ home">
        <img className="h-9 w-auto" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
      </Link>

      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Product analytics built for how your users <span className="text-[#245beb]">actually behave.</span>
        </h2>
        <p className="mt-4 text-sm leading-7 text-[#64706e]">
          Trends, funnels, retention, revenue, and error tracking — in one fast, self-hostable dashboard.
        </p>
        <ul className="mt-8 grid gap-3 text-sm text-[#101715]">
          {POINTS.map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span
                aria-hidden
                className="grid size-5 shrink-0 place-items-center rounded-full bg-[#ee8034] text-[11px] font-bold text-white"
              >
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <p className="relative font-mono text-xs text-[#64706e]">TraceIQ · product analytics</p>
    </aside>
  );
}
