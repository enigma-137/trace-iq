const CHILDREN_EXPRESSION = /\{\s*children\s*\}/g;

const DAMAGED_PARAMETER = /\(\s*<TraceIQProvider>\{\s*children\s*\}<\/TraceIQProvider>(\s*[:,)])/;

/**
 * Undoes the damage an earlier version of this installer did: it wrapped the function
 * parameter (`RootLayout(<TraceIQProvider>{children}</TraceIQProvider>: ...)`), leaving a
 * layout that does not parse. Restores `({ children }` so the JSX can be wrapped properly.
 */
export function repairDamagedParameter(source: string): string {
  return source.replace(DAMAGED_PARAMETER, '({ children }$1');
}

/**
 * Wraps the `{children}` that is rendered in JSX with `<TraceIQProvider>`.
 *
 * A layout usually mentions `{ children }` twice: first as the destructured function
 * parameter (`RootLayout({ children }: ...)`), then as the JSX child. Only the JSX one
 * may be wrapped; rewriting the parameter produces a file that no longer parses.
 * The JSX child sits next to a tag (`<body>{children}`, `{children}\n</Provider>`),
 * while the parameter is followed by `:`, `,` or `)`.
 *
 * Returns null when the layout does not render `{children}` directly.
 */
export function wrapJsxChildren(source: string): string | null {
  for (const match of source.matchAll(CHILDREN_EXPRESSION)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = source.slice(0, start).trimEnd().slice(-1);
    const after = source.slice(end).trimStart().charAt(0);
    if (before === '>' || after === '<') {
      return `${source.slice(0, start)}<TraceIQProvider>{children}</TraceIQProvider>${source.slice(end)}`;
    }
  }
  return null;
}
