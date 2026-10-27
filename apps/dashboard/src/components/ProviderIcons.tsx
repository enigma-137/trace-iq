/**
 * GitHub's mark has no brand color — it's shown solid black on light
 * surfaces and solid white on dark surfaces (per github.com/logos).
 * Uses currentColor so the caller can set neutral-900/white per theme.
 */
export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.15c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.21.67.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

/** GitLab's official tanuki mark — three brand oranges, per about.gitlab.com/press. */
export function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#E24329" d="m12 21.94-3.36-10.34H15.36Z" />
      <path fill="#FC6D26" d="M12 21.94 8.64 11.6H3.05Z" />
      <path fill="#FCA326" d="M3.05 11.6 1.9 15.1a.79.79 0 0 0 .29.88l9.81 5.96Z" />
      <path fill="#E24329" d="M3.05 11.6h5.59L6.29 3.98a.4.4 0 0 0-.76 0Z" />
      <path fill="#FC6D26" d="M12 21.94 15.36 11.6h5.59Z" />
      <path fill="#FCA326" d="m20.95 11.6 1.15 3.5a.79.79 0 0 1-.29.88l-9.81 5.96Z" />
      <path fill="#E24329" d="M20.95 11.6h-5.59l2.35-7.62a.4.4 0 0 1 .76 0Z" />
    </svg>
  );
}
