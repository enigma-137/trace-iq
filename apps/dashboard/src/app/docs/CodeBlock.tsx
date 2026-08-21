'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CodeBlockContainer({
  html,
  codeText,
  lang = 'ts'
}: {
  html: string;
  codeText: string;
  lang?: string;
}) {
  const [copied, setCopied] = useState(false);

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
    <div className="group relative my-3 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-900 dark:border-slate-800">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950/80 px-4 py-2 text-[11px] font-mono text-neutral-400">
        <span className="uppercase tracking-wide text-neutral-400">{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-sans text-neutral-400 transition hover:bg-neutral-800 hover:text-white"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Rendered Shiki Code HTML */}
      <div
        className="overflow-x-auto p-4 text-xs leading-6 [&_pre]:!bg-transparent [&_pre]:font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
