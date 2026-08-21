'use client';

import { useEffect, useState } from 'react';

interface TocHeading {
  id: string;
  text: string;
  level: number;
}

export function OnThisPageToc({ currentId }: { currentId: string }) {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    // Scan DOM inside doc content for H2 / H3 elements
    const elements = Array.from(document.querySelectorAll('section h2, section h3'));
    const list: TocHeading[] = elements.map((el, i) => {
      if (!el.id) {
        el.id = `heading-${i}-${el.textContent?.toLowerCase().replace(/\s+/g, '-') ?? ''}`;
      }
      return {
        id: el.id,
        text: el.textContent ?? '',
        level: el.tagName === 'H2' ? 2 : 3
      };
    });

    setHeadings(list);
    if (list.length > 0) setActiveId(list[0].id);

    // Scrollspy observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -40% 0px', threshold: 0.2 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [currentId]);

  if (headings.length === 0) return null;

  return (
    <aside className="hidden xl:block w-52 shrink-0">
      <nav className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pl-4 border-l border-neutral-200 dark:border-slate-800/80">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-neutral-400 dark:text-slate-500">
          On this page
        </p>
        <ul className="space-y-1.5 text-xs">
          {headings.map((h) => {
            const isActive = h.id === activeId;
            return (
              <li key={h.id} style={{ paddingLeft: h.level === 3 ? '12px' : '0px' }}>
                <a
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`block py-1 transition-colors ${
                    isActive
                      ? 'font-semibold text-blue-600 dark:text-cyan-400'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  {h.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
