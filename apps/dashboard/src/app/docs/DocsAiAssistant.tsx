'use client';

import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowRight01Icon from '@hugeicons/core-free-icons/ArrowRight01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import MagicWand01Icon from '@hugeicons/core-free-icons/MagicWand01Icon';
import Tick02Icon from '@hugeicons/core-free-icons/Tick02Icon';
import {
  AI_FEATURES,
  AI_LANGUAGES,
  buildAiPrompt,
  type AiFeatureId,
  type AiLanguageId
} from './ai-prompt';

type Step = 'language' | 'feature' | 'prompt';

export function DocsAiAssistant({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('language');
  const [languageId, setLanguageId] = useState<AiLanguageId | null>(null);
  const [featureId, setFeatureId] = useState<AiFeatureId>('general');
  const [copied, setCopied] = useState(false);

  // Lock the page behind the modal and let Escape dismiss it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const language = AI_LANGUAGES.find((l) => l.id === languageId) ?? null;
  const feature = AI_FEATURES.find((f) => f.id === featureId) ?? AI_FEATURES[0];

  const prompt = useMemo(
    () => (language ? buildAiPrompt(language, feature, apiBaseUrl) : ''),
    [language, feature, apiBaseUrl]
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (plain http / denied) — the text is still selectable.
    }
  };

  const chooseLanguage = (id: AiLanguageId) => {
    setLanguageId(id);
    setStep('feature');
  };

  const chooseFeature = (id: AiFeatureId) => {
    setFeatureId(id);
    setStep('prompt');
  };

  const startOver = () => {
    setLanguageId(null);
    setFeatureId('general');
    setStep('language');
  };

  return (
    <>
      {/* Floating trigger — docs only */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Generate an AI setup prompt for TraceIQ"
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-neutral-700 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        <HugeiconsIcon icon={MagicWand01Icon} size={16} />
        Copy prompt for AI
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="TraceIQ AI setup prompt">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />

          <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {/* <Sparkles className="size-4 text-blue-500" /> */}
                <div>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">TraceIQ AI setup prompt</p>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">
                    {step === 'language' && 'Step 1 of 3 — pick your language'}
                    {step === 'feature' && 'Step 2 of 3 — what would you like to implement?'}
                    {step === 'prompt' && 'Step 3 of 3 — copy the prompt into your AI tool'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {step === 'language' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {AI_LANGUAGES.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => chooseLanguage(lang.id)}
                      className="group flex items-start justify-between gap-3 rounded-lg border border-neutral-200 px-4 py-3 text-left transition hover:border-blue-400/60 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
                          {lang.label}
                          {lang.comingSoon && (
                            <span className="ml-2 rounded-full border border-neutral-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-400 dark:border-slate-700 dark:text-slate-500">
                              coming soon
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-slate-400">{lang.blurb}</span>
                      </span>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="mt-0.5 shrink-0 text-neutral-300 transition group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              )}

              {step === 'feature' && language && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {AI_FEATURES.map((feat) => (
                    <button
                      key={feat.id}
                      type="button"
                      onClick={() => chooseFeature(feat.id)}
                      className="group flex items-start justify-between gap-3 rounded-lg border border-neutral-200 px-4 py-3 text-left transition hover:border-blue-400/60 hover:bg-blue-50/40 dark:border-slate-800 dark:hover:border-blue-500/50 dark:hover:bg-blue-500/10"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-neutral-900 dark:text-white">{feat.label}</span>
                        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-slate-400">{feat.description}</span>
                      </span>
                      <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="mt-0.5 shrink-0 text-neutral-300 transition group-hover:text-blue-500" />
                    </button>
                  ))}
                </div>
              )}

              {step === 'prompt' && language && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-slate-700 dark:text-slate-200">
                      {language.label}
                      <button type="button" onClick={startOver} className="text-neutral-400 hover:text-neutral-900 dark:text-slate-500 dark:hover:text-white">
                        change
                      </button>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-slate-700 dark:text-slate-200">
                      {feature.label}
                      <button type="button" onClick={() => setStep('feature')} className="text-neutral-400 hover:text-neutral-900 dark:text-slate-500 dark:hover:text-white">
                        change
                      </button>
                    </span>
                  </div>

                  <pre className="max-h-[50vh] overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-6 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                    {prompt}
                  </pre>

                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white transition hover:bg-neutral-700 active:scale-[0.98] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                  >
                    {copied ? <HugeiconsIcon icon={Tick02Icon} size={16} /> : <HugeiconsIcon icon={Copy01Icon} size={16} />}
                    {copied ? 'Copied!' : 'Copy prompt'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
