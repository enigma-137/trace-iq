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
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<AiFeatureId[]>(['general']);
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
  const selectedFeatures = useMemo(
    () => AI_FEATURES.filter((f) => selectedFeatureIds.includes(f.id)),
    [selectedFeatureIds]
  );

  const prompt = useMemo(
    () => (language ? buildAiPrompt(language, selectedFeatures, apiBaseUrl) : ''),
    [language, selectedFeatures, apiBaseUrl]
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

  const toggleFeature = (id: AiFeatureId) => {
    if (id === 'general') {
      setSelectedFeatureIds(['general']);
      return;
    }

    const currentNonGeneral = selectedFeatureIds.filter((fid) => fid !== 'general');
    if (currentNonGeneral.includes(id)) {
      const remaining = currentNonGeneral.filter((fid) => fid !== id);
      setSelectedFeatureIds(remaining.length > 0 ? remaining : ['general']);
    } else {
      setSelectedFeatureIds([...currentNonGeneral, id]);
    }
  };

  const selectAllSpecificFeatures = () => {
    setSelectedFeatureIds(AI_FEATURES.filter((f) => f.id !== 'general').map((f) => f.id));
  };

  const selectBaseOnly = () => {
    setSelectedFeatureIds(['general']);
  };

  const startOver = () => {
    setLanguageId(null);
    setSelectedFeatureIds(['general']);
    setStep('language');
  };

  const isGeneralOnly = selectedFeatureIds.length === 1 && selectedFeatureIds[0] === 'general';
  const specificSelectedCount = isGeneralOnly ? 0 : selectedFeatureIds.length;

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

          <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">TraceIQ AI setup prompt</p>
                  <p className="text-xs text-neutral-400 dark:text-slate-500">
                    {step === 'language' && 'Step 1 of 3 — pick your language'}
                    {step === 'feature' && 'Step 2 of 3 — select one or more features to implement'}
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
                <div className="flex flex-col gap-4">
                  {/* Selection header with quick actions */}
                  <div className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-3 dark:border-slate-800/80">
                    <span className="text-xs font-medium text-neutral-500 dark:text-slate-400">
                      {isGeneralOnly ? (
                        <span className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                          Base setup only
                        </span>
                      ) : (
                        <span className="rounded-md bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                          {specificSelectedCount} {specificSelectedCount === 1 ? 'feature' : 'features'} selected
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllSpecificFeatures}
                        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Select all
                      </button>
                      <span className="text-neutral-300 dark:text-slate-700">•</span>
                      <button
                        type="button"
                        onClick={selectBaseOnly}
                        className="text-xs font-medium text-neutral-500 hover:underline dark:text-slate-400"
                      >
                        Reset to base only
                      </button>
                    </div>
                  </div>

                  {/* Feature checkboxes list */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {AI_FEATURES.map((feat) => {
                      const isSelected = selectedFeatureIds.includes(feat.id);
                      return (
                        <button
                          key={feat.id}
                          type="button"
                          onClick={() => toggleFeature(feat.id)}
                          aria-checked={isSelected}
                          role="checkbox"
                          className={`group flex items-start justify-between gap-3 rounded-lg border p-3.5 text-left transition ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/50 shadow-sm dark:border-blue-500 dark:bg-blue-500/10'
                              : 'border-neutral-200 hover:border-neutral-300 dark:border-slate-800 dark:hover:border-slate-700'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
                              {feat.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-neutral-500 dark:text-slate-400">
                              {feat.description}
                            </span>
                          </span>
                          <div
                            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border transition ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                                : 'border-neutral-300 bg-white group-hover:border-neutral-400 dark:border-slate-700 dark:bg-slate-900'
                            }`}
                          >
                            {isSelected && <HugeiconsIcon icon={Tick02Icon} size={14} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions bar */}
                  <div className="flex items-center justify-between border-t border-neutral-100 pt-3 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setStep('language')}
                      className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      ← Back to languages
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep('prompt')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-xs font-semibold text-white shadow transition hover:bg-neutral-700 active:scale-95 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      Continue to prompt
                      <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
                    </button>
                  </div>
                </div>
              )}

              {step === 'prompt' && language && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      Language: {language.label}
                      <button type="button" onClick={startOver} className="text-blue-500 hover:underline">
                        change
                      </button>
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedFeatures.map((feat) => (
                        <span
                          key={feat.id}
                          className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50/80 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
                        >
                          {feat.label}
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setStep('feature')}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        (edit)
                      </button>
                    </div>
                  </div>

                  <pre className="max-h-[50vh] overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-6 text-neutral-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 font-mono">
                    {prompt}
                  </pre>

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setStep('feature')}
                      className="text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
                    >
                      ← Back to features
                    </button>
                    <button
                      type="button"
                      onClick={copy}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-neutral-900 px-5 text-sm font-semibold text-white shadow transition hover:bg-neutral-700 active:scale-[0.98] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      {copied ? <HugeiconsIcon icon={Tick02Icon} size={16} /> : <HugeiconsIcon icon={Copy01Icon} size={16} />}
                      {copied ? 'Copied!' : 'Copy prompt'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
