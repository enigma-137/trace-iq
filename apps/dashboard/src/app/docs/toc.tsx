'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, BookOpen, Terminal, FileCode, Clock, Server } from 'lucide-react';

export interface DocsTocItem {
  id: string;
  label: string;
  category: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Getting started': <Clock className="size-3.5" />,
  Deployment: <Server className="size-3.5" />,
  'Server & mobile SDKs': <Terminal className="size-3.5" />,
  Features: <BookOpen className="size-3.5" />,
  Reference: <FileCode className="size-3.5" />
};

export function TocNav({
  sections,
  currentId,
  basePath,
  onItemClick
}: {
  sections: DocsTocItem[];
  currentId: string;
  basePath: string;
  onItemClick?: () => void;
}) {
  const categories = Array.from(new Set(sections.map((s) => s.category)));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const items = sections.filter((s) => s.category === category);
        const isCollapsed = collapsed[category];
        const icon = CATEGORY_ICONS[category] ?? <BookOpen className="size-3.5" />;

        return (
          <div key={category} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              className="flex w-full items-center justify-between py-1 text-left text-xs font-bold uppercase tracking-[0.1em] text-neutral-400 transition hover:text-neutral-700 dark:text-slate-500 dark:hover:text-slate-300"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-400 dark:text-slate-500">{icon}</span>
                <span>{category}</span>
              </div>
              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
            </button>

            {!isCollapsed ? (
              <ul className="space-y-0.5 pt-1">
                {items.map((s) => {
                  const isActive = s.id === currentId;
                  return (
                    <li key={s.id}>
                      <Link
                        onClick={onItemClick}
                        className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-all ${isActive
                            ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-cyan-500/10 dark:text-cyan-300 border-l-2 border-blue-600 dark:border-cyan-400'
                            : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-200'
                          }`}
                        href={`${basePath}?page=${s.id}`}
                      >
                        <span className="truncate">{s.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
