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
