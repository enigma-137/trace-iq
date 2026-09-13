'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';

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
      className="group inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-blue-700 transition hover:border-blue-500/40 hover:bg-blue-500/15 dark:border-blue-400/25 dark:text-blue-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/25"
    >
      <span className="truncate max-w-[130px] sm:max-w-none">
        #{copied ? 'Copied ID!' : projectId}
      </span>
      {copied ? (
        <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} className="text-emerald-500 dark:text-emerald-400" />
      ) : (
        <HugeiconsIcon icon={Copy01Icon} size={12} className="text-blue-500/70 transition-opacity group-hover:opacity-100 dark:text-blue-400/70" />
      )}
    </button>
  );
}
