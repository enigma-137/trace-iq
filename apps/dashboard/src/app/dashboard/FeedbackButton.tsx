'use client';

import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import BubbleChatIcon from '@hugeicons/core-free-icons/BubbleChatIcon';
import { clientFetch } from '@/lib/analytics-api';

type Kind = 'idea' | 'problem' | 'other';

const KINDS: Array<{ value: Kind; label: string; placeholder: string }> = [
  { value: 'idea', label: 'Idea', placeholder: 'What would make TraceIQ more useful for you?' },
  { value: 'problem', label: 'Problem', placeholder: 'What went wrong, and on which page?' },
  { value: 'other', label: 'Other', placeholder: 'Anything you want the TraceIQ team to know.' }
];

const MAX = 2000;

/** Header button that sends feedback straight to the TraceIQ team's admin inbox. */
export function FeedbackButton({ projectId }: { projectId?: string | null }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('idea');
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const trimmed = text.trim();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggle() {
    setOpen((value) => {
      // Reopening after a send starts a fresh message.
      if (!value && state === 'sent') {
        setState('idle');
        setText('');
      }
      return !value;
    });
  }

  async function submit() {
    if (trimmed.length < 5 || state === 'sending') return;
    setState('sending');
    setError(null);
    const { error: message } = await clientFetch<{ id: string }>('/v1/feedback', {
      method: 'POST',
      body: JSON.stringify({ kind, message: trimmed, projectId: projectId ?? undefined, page: window.location.pathname })
    });
    if (message) {
      const technical = /^(Cannot \w+ \/|Request failed \(\d+\)|Internal server error|Failed to fetch)/i.test(message);
      setError(technical ? "Couldn't send just now. Try again in a minute." : message);
      setState('idle');
    } else {
      setState('sent');
    }
  }

  const placeholder = KINDS.find((option) => option.value === kind)?.placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Send feedback"
        title="Send feedback"
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <HugeiconsIcon icon={BubbleChatIcon} size={14} strokeWidth={1.8} className="text-neutral-500 dark:text-slate-400" />
        <span className="hidden md:inline">Feedback</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Send feedback"
          className="absolute right-0 top-10 z-30 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950"
        >
          {state === 'sent' ? (
            <div className="px-4 py-7 text-center">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">Thanks for the feedback</p>
              <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-snug text-neutral-500 dark:text-slate-400">
                The TraceIQ team reads every message. If we need more detail, we&apos;ll reply by email.
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-4 inline-flex h-7 items-center rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                Close
              </button>
            </div>
          ) : (
            <form
              className="space-y-3 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div>
                <p className="text-xs font-semibold text-neutral-900 dark:text-white">Send feedback</p>
                <p className="text-[11px] text-neutral-500 dark:text-slate-400">Goes straight to the TraceIQ team.</p>
              </div>
              <div role="radiogroup" aria-label="Feedback type" className="grid grid-cols-3 rounded-md border border-neutral-200 p-0.5 dark:border-slate-700">
                {KINDS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={kind === option.value}
                    onClick={() => setKind(option.value)}
                    className={
                      kind === option.value
                        ? 'h-6 rounded-[4px] bg-neutral-900 text-[11px] font-medium text-white dark:bg-white dark:text-slate-950'
                        : 'h-6 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, MAX))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit();
                }}
                rows={5}
                autoFocus
                aria-label="Your feedback"
                placeholder={placeholder}
                className="block w-full resize-none rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
              />
              {error ? <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
              <div className="flex items-center justify-between">
                <span className="text-[10px] tabular-nums text-neutral-400 dark:text-slate-500">{text.length > MAX - 200 ? `${text.length}/${MAX}` : ''}</span>
                <button
                  type="submit"
                  disabled={trimmed.length < 5 || state === 'sending'}
                  className="inline-flex h-7 items-center rounded-md bg-neutral-900 px-3 text-xs font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-950"
                >
                  {state === 'sending' ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
