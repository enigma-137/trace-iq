import Link from 'next/link';

export interface DocsTocItem {
  id: string;
  label: string;
  category: string;
}

export function TocNav({
  sections,
  currentId,
  basePath
}: {
  sections: DocsTocItem[];
  currentId: string;
  basePath: string;
}) {
  return (
    <div className="grid gap-5">
      {Array.from(new Set(sections.map((s) => s.category))).map((category) => (
        <div key={category}>
          <p className="mb-1 pl-3 text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">
            {category}
          </p>
          <ul className="grid gap-1 text-sm">
            {sections
              .filter((s) => s.category === category)
              .map((s) => {
                const isActive = s.id === currentId;
                return (
                  <li key={s.id}>
                    <Link
                      className={`block border-l-2 py-1 pl-3 transition ${
                        isActive
                          ? 'font-semibold text-neutral-900 dark:text-white border-slate-900 dark:border-white'
                          : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                      href={`${basePath}?page=${s.id}`}
                    >
                      {s.label}
                    </Link>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
