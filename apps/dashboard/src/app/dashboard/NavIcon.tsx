const PATHS: Record<string, string> = {
  // Overview — home
  overview: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5',
  // Web analytics — globe
  web: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9Z',
  // Insights — trending line
  insights: 'M4 19V5M4 19h16M7 15l3-4 3 2 4-6',
  // Events — activity list
  events: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  // Funnels — funnel
  funnels: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  // Retention — history / return-over-time
  retention: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2',
  // Cohorts — stacked layers / groups
  cohorts: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5',
  // Alerts — bell
  alerts: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  // Feature flags — flag on a pole
  flags: 'M5 21V4M5 4h11l-2.5 4L16 12H5',
  // Webhooks — interlocking arcs (relay)
  webhooks:
    'M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2M6 17l3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06M12 6l3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8',
  // Export — download to disk
  export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  // Users — people
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.87M16.5 4.13a4 4 0 0 1 0 7.75',
  // Errors — alert triangle
  errors: 'M12 3 2 20h20L12 3ZM12 9v5M12 17.5h.01',
  // Docs — book
  docs: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5ZM18 3v18',
  // Settings — gear
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 13a7.8 7.8 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7.8 7.8 0 0 0-1.7-1L14.9 3H9.1l-.4 2.5a7.8 7.8 0 0 0-1.7 1l-2.4-1-2 3.5L2.6 11a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.8 7.8 0 0 0 1.7 1l.4 2.5h5.8l.4-2.5a7.8 7.8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5Z'
};

export function NavIcon({ name }: { name: string }) {
  const d = PATHS[name] ?? PATHS.overview;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
