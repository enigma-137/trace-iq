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

/** Linear's mark, drawn in currentColor so it follows the text color in light and dark. */
export function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor" aria-hidden>
      <path d="M1.22 61.52c-.22-.95.91-1.55 1.6-.86l36.52 36.52c.69.69.09 1.82-.86 1.6A50.07 50.07 0 0 1 1.22 61.52ZM0 46.89a1 1 0 0 0 .29.77l52.05 52.05c.2.2.48.31.77.29a49.94 49.94 0 0 0 6.95-.93c.77-.16 1.04-1.1.48-1.66L2.82 39.69c-.56-.56-1.5-.29-1.66.48a49.94 49.94 0 0 0-.93 6.95ZM4.21 29.7c-.17.38-.08.82.21 1.11l64.77 64.77c.29.29.73.38 1.11.21a50.3 50.3 0 0 0 5.24-2.79c.56-.34.64-1.11.18-1.57L8.57 24.28c-.46-.46-1.23-.38-1.57.18a50.3 50.3 0 0 0-2.79 5.24ZM12.66 18.07c-.38-.38-.4-.98-.04-1.38A49.86 49.86 0 0 1 50.02 0C77.62 0 100 22.38 100 50c0 14.76-6.4 28.03-16.57 37.18-.4.36-1 .34-1.38-.04L12.66 18.07Z" />
    </svg>
  );
}
