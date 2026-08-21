'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function ProjectIdBadge({ projectId }: { projectId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(projectId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const shortId = projectId.length > 20 ? `${projectId.slice(0, 10)}...${projectId.slice(-6)}` : projectId;

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Click to copy Project ID: #${projectId}`}
      className="group inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-blue-700 transition hover:border-blue-500/40 hover:bg-blue-500/15 dark:border-blue-400/25 dark:bg-blue-400/15 dark:text-blue-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/25"
    >
      <span className="truncate max-w-[130px] sm:max-w-none">
        #{copied ? 'Copied ID!' : projectId}
      </span>
      {copied ? (
        <Check className="size-3 text-emerald-500 dark:text-emerald-400" />
      ) : (
        <Copy className="size-3 text-blue-500/70 transition-opacity group-hover:opacity-100 dark:text-blue-400/70" />
      )}
    </button>
  );
}
