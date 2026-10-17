'use client';

import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';

export function CodeBlock({
  codeText,
  lang = 'ts'
}: {
  codeText: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // Loaded lazily: a static import makes this module (and every page that
    // imports it) an async module, which breaks server rendering of /docs.
    import('shiki')
      .then(({ codeToHtml }) =>
        codeToHtml(codeText, {
          lang,
          themes: { light: 'github-light', dark: 'github-dark' },
          defaultColor: false
        })
      )
      .then((res) => {
        if (active) setHtml(res);
      })
      .catch(() => {
        // Fallback on invalid language
      });
    return () => {
      active = false;
    };
  }, [codeText, lang]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-neutral-200 bg-slate-950 dark:border-slate-800">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-slate-900/90 px-4 py-2 text-[11px] font-mono text-slate-400">
        <span className="uppercase tracking-wide font-semibold text-slate-400">{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-sans text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          {copied ? (
            <>
              <HugeiconsIcon icon={Tick02Icon} size={14} className="text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Copied!</span>
            </>
          ) : (
            <>
              <HugeiconsIcon icon={Copy01Icon} size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      {html ? (
        <div
          className="overflow-x-auto p-4 text-xs leading-6 text-slate-100 [&_pre]:!bg-transparent [&_pre]:font-mono"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="overflow-x-auto p-4 text-xs leading-6 text-slate-100">
          <pre className="font-mono whitespace-pre">{codeText}</pre>
        </div>
      )}
    </div>
  );
}
