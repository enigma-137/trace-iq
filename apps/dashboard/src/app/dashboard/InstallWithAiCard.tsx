'use client';

import { useMemo, useState } from 'react';
import type { AiLanguageId } from '@/app/docs/ai-prompt';
import { INSTALL_STACKS, buildInstallPrompt, findInstallLanguage } from '@/lib/install-prompt';
import { toast } from '@/lib/toast';

interface InstallWithAiCardProps {
  projectId: string;
  projectName: string;
  writeKey: string;
  apiUrl: string;
  /** Product ids picked in the wizard's first step. */
  products: string[];
  /** Shown as the masked form in the preview; the copied prompt carries the real key. */
  maskedWriteKey: string;
}

/**
 * The wizard's main install path: pick your stack, copy a prompt, paste it into Claude Code,
 * Cursor or Codex in your repository. The prompt already holds the project ID and key, so the
 * assistant has nothing left to ask for.
 */
export function InstallWithAiCard({ projectId, projectName, writeKey, apiUrl, products, maskedWriteKey }: InstallWithAiCardProps) {
  const [stackId, setStackId] = useState<AiLanguageId>('javascript');
  const [copied, setCopied] = useState(false);
  const language = findInstallLanguage(stackId);
  const stack = INSTALL_STACKS.find((item) => item.id === stackId);

  const build = (key: string | undefined) =>
    buildInstallPrompt({ language, projectId, projectName, writeKey: key || undefined, apiUrl, products });
  const prompt = useMemo(() => build(writeKey), [language, projectId, projectName, writeKey, apiUrl, products]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => build(writeKey ? maskedWriteKey : undefined), [language, projectId, projectName, writeKey, maskedWriteKey, apiUrl, products]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
      toast.success('Paste it into Claude Code, Cursor or Codex, in your app’s repository.', { title: 'Install prompt copied' });
    } catch {
      toast.error('Your browser blocked copying. Allow clipboard access and try again.');
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/60 to-indigo-50/30 p-5 dark:border-blue-900/50 dark:from-blue-950/20 dark:to-slate-900">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
          Recommended · Install with AI
        </span>
        <span className="text-xs text-blue-700 dark:text-blue-400">About a minute</span>
      </div>
      <h4 className="mt-2 text-base font-semibold text-neutral-900 dark:text-white">Let your coding assistant set it up</h4>
      <p className="mt-1 text-xs text-neutral-600 dark:text-slate-400">
        Pick your stack and copy the prompt. It already has your project ID and write key, so Claude Code, Cursor or Codex can install the SDK, wire
        the credentials, and check it runs, without asking you for anything.
      </p>

      <div role="radiogroup" aria-label="Your stack" className="mt-4 flex flex-wrap gap-2">
        {INSTALL_STACKS.map((item) => {
          const active = item.id === stackId;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              title={item.hint}
              onClick={() => setStackId(item.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {stack ? <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">{stack.hint}</p> : null}

      {!writeKey ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300" role="status">
          Generate your write key above first. Until then the prompt tells the assistant that no key exists yet, so events can&apos;t be sent.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
        >
          {copied ? 'Copied' : 'Copy install prompt'}
        </button>
        <span className="text-xs text-neutral-500 dark:text-slate-400">Then come back here: the next step listens for your first event.</span>
      </div>

      <details className="mt-4 text-xs text-neutral-600 dark:text-slate-400">
        <summary className="cursor-pointer font-medium text-neutral-700 dark:text-slate-300">See what the prompt says</summary>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-neutral-950 p-3 font-mono text-[11px] leading-5 text-neutral-200 dark:bg-black">{preview}</pre>
      </details>
    </div>
  );
}
