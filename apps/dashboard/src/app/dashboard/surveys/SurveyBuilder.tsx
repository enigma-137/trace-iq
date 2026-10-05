'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { Survey, SurveyQuestion, SurveyQuestionType, SurveyTargeting } from '@traceiq/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface SurveyBuilderProps {
  initialSurvey?: Survey | null;
  projectId?: string | null;
  token?: string | null;
}

export function SurveyBuilder({ initialSurvey, projectId, token: initialToken }: SurveyBuilderProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const isEditing = Boolean(initialSurvey?.id);

  async function getAuthToken(): Promise<string | null> {
    if (initialToken) return initialToken;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  const [name, setName] = useState(initialSurvey?.name || '');
  const [description, setDescription] = useState(initialSurvey?.description || '');
  const [environment, setEnvironment] = useState(initialSurvey?.environment || 'production');
  const [targetingType, setTargetingType] = useState<'all' | 'property' | 'event'>(
    initialSurvey?.targeting?.type || 'all'
  );
  const [propertyKey, setPropertyKey] = useState(initialSurvey?.targeting?.propertyKey || '');
  const [propertyValue, setPropertyValue] = useState(
    initialSurvey?.targeting?.propertyValue !== undefined ? String(initialSurvey.targeting.propertyValue) : ''
  );
  const [eventName, setEventName] = useState(initialSurvey?.targeting?.eventName || '');

  const [questions, setQuestions] = useState<SurveyQuestion[]>(
    initialSurvey?.questions && initialSurvey.questions.length > 0
      ? initialSurvey.questions
      : [
          {
            id: 'q_1',
            type: 'nps',
            prompt: 'How likely are you to recommend TraceIQ to a colleague or friend?',
            required: true
          },
          {
            id: 'q_2',
            type: 'single_choice',
            prompt: 'How often do you use TraceIQ?',
            required: false,
            options: [
              { id: 'opt_1', label: 'Daily', value: 'daily' },
              { id: 'opt_2', label: 'A few times a week', value: 'weekly' },
              { id: 'opt_3', label: 'A few times a month', value: 'monthly' }
            ]
          },
          {
            id: 'q_3',
            type: 'long_text',
            prompt: 'What is the most important feature we could add or improve?',
            required: false
          }
        ]
  );

  const [previewQuestionIndex, setPreviewQuestionIndex] = useState(0);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isQuestionAnswered = (q: SurveyQuestion, answers: Record<string, any>): boolean => {
    const ans = answers[q.id];
    if (ans === undefined || ans === null) return false;
    if (q.type === 'single_choice') {
      return typeof ans === 'string' && ans.trim().length > 0;
    }
    if (q.type === 'multiple_choice') {
      return Array.isArray(ans) && ans.length > 0;
    }
    if (q.type === 'rating_scale' || q.type === 'nps') {
      return typeof ans === 'number';
    }
    if (q.type === 'short_text' || q.type === 'long_text') {
      return typeof ans === 'string' && ans.trim().length > 0;
    }
    return Boolean(ans);
  };

  const handlePreviewAnswer = (qId: string, value: any) => {
    setPreviewAnswers((prev) => ({ ...prev, [qId]: value }));
    setPreviewError(null);
  };

  const handlePreviewNext = () => {
    if (currentPreviewQ?.required && !isQuestionAnswered(currentPreviewQ, previewAnswers)) {
      setPreviewError('Please answer this required question before continuing.');
      return;
    }
    setPreviewError(null);
    setPreviewQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1));
  };

  const handlePreviewSubmit = () => {
    if (currentPreviewQ?.required && !isQuestionAnswered(currentPreviewQ, previewAnswers)) {
      setPreviewError('Please answer this required question before submitting.');
      return;
    }
    setPreviewError(null);
    alert('Survey submission test complete!');
  };

  const addQuestion = (type: SurveyQuestionType = 'single_choice') => {
    const nextIdx = questions.length + 1;
    const newId = `q_${Date.now()}`;
    let defaultOptions = undefined;
    let defaultPrompt = `Question ${nextIdx}`;

    if (type === 'single_choice' || type === 'multiple_choice') {
      defaultOptions = [
        { id: `opt_1`, label: 'Option 1', value: 'option_1' },
        { id: `opt_2`, label: 'Option 2', value: 'option_2' }
      ];
      defaultPrompt = 'Select an option:';
    } else if (type === 'rating_scale') {
      defaultPrompt = 'How would you rate your experience?';
    } else if (type === 'nps') {
      defaultPrompt = 'How likely are you to recommend our product?';
    } else if (type === 'short_text') {
      defaultPrompt = 'Please share your thoughts:';
    } else if (type === 'long_text') {
      defaultPrompt = 'What can we improve?';
    }

    setQuestions([
      ...questions,
      {
        id: newId,
        type,
        prompt: defaultPrompt,
        required: true,
        options: defaultOptions,
        minRating: 1,
        maxRating: 5,
        minLabel: 'Poor',
        maxLabel: 'Excellent'
      }
    ]);
  };

  const updateQuestion = (index: number, updates: Partial<SurveyQuestion>) => {
    const next = [...questions];
    next[index] = { ...next[index], ...updates };
    setQuestions(next);
  };

  const moveQuestion = (from: number, to: number) => {
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setQuestions(next);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) {
      alert('A survey must have at least one question.');
      return;
    }
    const next = questions.filter((_, idx) => idx !== index);
    setQuestions(next);
  };

  const addOption = (qIndex: number) => {
    const q = questions[qIndex];
    const opts = q.options || [];
    const nextOptNum = opts.length + 1;
    const newOpt = {
      id: `opt_${Date.now()}`,
      label: `Option ${nextOptNum}`,
      value: `option_${nextOptNum}`
    };
    updateQuestion(qIndex, { options: [...opts, newOpt] });
  };

  const updateOption = (qIndex: number, optIndex: number, label: string) => {
    const q = questions[qIndex];
    const opts = [...(q.options || [])];
    opts[optIndex] = {
      ...opts[optIndex],
      label,
      value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    };
    updateQuestion(qIndex, { options: opts });
  };

  const removeOption = (qIndex: number, optIndex: number) => {
    const q = questions[qIndex];
    const opts = (q.options || []).filter((_, idx) => idx !== optIndex);
    updateQuestion(qIndex, { options: opts });
  };

  const handleSubmit = async (publishImmediately = false) => {
    if (!name.trim()) {
      setError('Survey name is required.');
      return;
    }
    if (questions.length === 0) {
      setError('Please add at least one question.');
      return;
    }
    if (targetingType === 'event' && !eventName.trim()) {
      setError('Trigger event name is required when targeting by event.');
      return;
    }
    if (targetingType === 'property' && (!propertyKey.trim() || !propertyValue.trim())) {
      setError('User property name and value are required when targeting by property.');
      return;
    }

    setLoading(true);
    setError(null);

    const token = await getAuthToken();

    const targeting: SurveyTargeting = {
      type: targetingType,
      propertyKey: targetingType === 'property' ? propertyKey.trim() : undefined,
      propertyValue: targetingType === 'property' ? propertyValue.trim() : undefined,
      eventName: targetingType === 'event' ? eventName.trim() : undefined
    };

    try {
      if (isEditing && initialSurvey?.id) {
        const url = `${apiBaseUrl}/v1/dashboard/surveys/${initialSurvey.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
        const res = await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            environment,
            questions,
            targeting,
            projectId
          })
        });

        if (!res.ok) throw new Error('Failed to update survey');

        if (publishImmediately) {
          await fetch(`${apiBaseUrl}/v1/dashboard/surveys/${initialSurvey.id}/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ status: 'published', projectId })
          });
        }

        router.push(`/dashboard/surveys/${initialSurvey.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
      } else {
        const url = `${apiBaseUrl}/v1/dashboard/surveys${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            environment,
            questions,
            targeting,
            projectId
          })
        });

        if (!res.ok) throw new Error('Failed to create survey');
        const created = await res.json();

        if (publishImmediately && created.id) {
          await fetch(`${apiBaseUrl}/v1/dashboard/surveys/${created.id}/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ status: 'published', projectId })
          });
        }

        router.push(`/dashboard/surveys/${created.id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`);
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Error saving survey');
    } finally {
      setLoading(false);
    }
  };

  const currentPreviewQ = questions[previewQuestionIndex] || questions[0];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
            <Link
              href={`/dashboard/surveys${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
              className="hover:text-neutral-900 dark:hover:text-white"
            >
              Surveys
            </Link>
            <span>/</span>
            <span>{isEditing ? 'Edit Survey' : 'New Survey'}</span>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl">
            {isEditing ? `Edit: ${initialSurvey?.name}` : 'Create In-App Survey'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/surveys${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`}
            className="rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSubmit(false)}
            className="rounded-lg border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Save Draft
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSubmit(true)}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 disabled:opacity-50"
          >
            {isEditing ? 'Save & Publish' : 'Publish Survey'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 2-Column Builder Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Editor (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* General Survey Settings */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Survey Details</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                  Survey Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Product Experience CSAT"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                    Environment
                  </label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                    Description (Internal)
                  </label>
                  <input
                    type="text"
                    placeholder="Optional notes"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Question Blocks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Questions ({questions.length})
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addQuestion('single_choice')}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  + Choice
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('nps')}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  + NPS
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('rating_scale')}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  + Rating
                </button>
                <button
                  type="button"
                  onClick={() => addQuestion('long_text')}
                  className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  + Text
                </button>
              </div>
            </div>

            {questions.map((q, qIdx) => (
              <div
                key={q.id || `q_${qIdx}`}
                className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs transition dark:border-slate-800 dark:bg-slate-950"
              >
                {/* Question Block Header */}
                <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                      {qIdx + 1}
                    </span>
                    <select
                      value={q.type}
                      onChange={(e) => updateQuestion(qIdx, { type: e.target.value as SurveyQuestionType })}
                      className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="single_choice">Single Choice</option>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="nps">NPS Score (0–10)</option>
                      <option value="rating_scale">Rating Scale (1–5)</option>
                      <option value="short_text">Short Text</option>
                      <option value="long_text">Long Text (Textarea)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <label className="mr-2 flex items-center gap-1.5 text-xs text-neutral-600 dark:text-slate-400">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => updateQuestion(qIdx, { required: e.target.checked })}
                        className="rounded-sm border-neutral-300 text-blue-600"
                      />
                      <span>Required</span>
                    </label>

                    <button
                      type="button"
                      disabled={qIdx === 0}
                      onClick={() => moveQuestion(qIdx, qIdx - 1)}
                      className="p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 dark:hover:text-white"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={qIdx === questions.length - 1}
                      onClick={() => moveQuestion(qIdx, qIdx + 1)}
                      className="p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30 dark:hover:text-white"
                      title="Move down"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIdx)}
                      className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      title="Delete question"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Prompt input */}
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 dark:text-slate-400">
                      Question Prompt
                    </label>
                    <input
                      type="text"
                      value={q.prompt}
                      onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
                      placeholder="e.g. How satisfied are you with our product?"
                      className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  {/* Options editor for choice types */}
                  {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                    <div className="space-y-2 rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-neutral-700 dark:text-slate-300">
                          Choice Options
                        </label>
                        <button
                          type="button"
                          onClick={() => addOption(qIdx)}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          + Add Option
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {(q.options || []).map((opt, optIdx) => (
                          <div key={opt.id || optIdx} className="flex items-center gap-2">
                            <span className="text-neutral-400 text-xs">
                              {q.type === 'single_choice' ? '○' : '□'}
                            </span>
                            <input
                              type="text"
                              value={opt.label}
                              onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                              placeholder={`Option ${optIdx + 1}`}
                              className="flex-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                            {(q.options?.length || 0) > 1 && (
                              <button
                                type="button"
                                onClick={() => removeOption(qIdx, optIdx)}
                                className="text-neutral-400 hover:text-red-500 text-xs p-1"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rating scale labels */}
                  {q.type === 'rating_scale' && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
                      <div>
                        <label className="text-[11px] font-semibold text-neutral-700 dark:text-slate-300">
                          Min Label (1)
                        </label>
                        <input
                          type="text"
                          value={q.minLabel || 'Poor'}
                          onChange={(e) => updateQuestion(qIdx, { minLabel: e.target.value })}
                          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-neutral-700 dark:text-slate-300">
                          Max Label (5)
                        </label>
                        <input
                          type="text"
                          value={q.maxLabel || 'Excellent'}
                          onChange={(e) => updateQuestion(qIdx, { maxLabel: e.target.value })}
                          className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Targeting Rules */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">Audience Targeting</h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Configure who will see this in-app survey when requested by the SDK.
            </p>

            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'All Users' },
                  { id: 'property', label: 'Matching User Property' },
                  { id: 'event', label: 'Trigger on Specific Event' }
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTargetingType(t.id as any)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                      targetingType === t.id
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300 font-semibold'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {targetingType === 'property' && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-100 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-slate-300">
                      User Property Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. plan or role"
                      value={propertyKey}
                      onChange={(e) => setPropertyKey(e.target.value)}
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-slate-300">
                      Equals Value <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. enterprise or pro"
                      value={propertyValue}
                      onChange={(e) => setPropertyValue(e.target.value)}
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {targetingType === 'event' && (
                <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <label className="text-[11px] font-semibold text-neutral-700 dark:text-slate-300">
                    Trigger Event Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. checkout_completed or onboarding_finished"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-mono text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive In-App Survey Preview (5 cols) */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                Live In-App Preview
              </span>
              <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    previewDevice === 'desktop'
                      ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                      : 'text-neutral-500 dark:text-slate-400'
                  }`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                    previewDevice === 'mobile'
                      ? 'bg-white text-neutral-900 shadow-xs dark:bg-slate-800 dark:text-white'
                      : 'text-neutral-500 dark:text-slate-400'
                  }`}
                >
                  Mobile
                </button>
              </div>
            </div>

            {/* Container */}
            <div
              className={`mx-auto rounded-2xl border border-neutral-200 bg-neutral-100 p-4 transition-all duration-300 dark:border-slate-800 dark:bg-slate-900/60 ${
                previewDevice === 'mobile' ? 'max-w-[340px]' : 'w-full'
              }`}
            >
              {/* In-App Survey Card Mockup */}
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
                {/* Survey Card Header */}
                <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-600" />
                    <span className="text-[11px] font-semibold text-neutral-800 dark:text-slate-200 truncate max-w-[200px]">
                      {name || 'Survey Preview'}
                    </span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {previewQuestionIndex + 1} of {questions.length}
                  </span>
                </div>

                {/* Question Body */}
                <div className="p-4 space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-neutral-900 dark:text-white leading-snug">
                      {currentPreviewQ?.prompt || 'Question Prompt'}
                      {currentPreviewQ?.required && <span className="text-red-500 ml-0.5">*</span>}
                    </h4>
                  </div>

                  {previewError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300">
                      {previewError}
                    </div>
                  )}

                  {/* Interactive Question Types */}
                  {currentPreviewQ?.type === 'single_choice' && (
                    <div className="space-y-1.5">
                      {(currentPreviewQ.options || []).map((opt) => (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-200 p-2.5 text-xs text-neutral-800 transition hover:bg-neutral-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                        >
                          <input
                            type="radio"
                            name={`preview_${currentPreviewQ.id}`}
                            checked={previewAnswers[currentPreviewQ.id] === opt.value}
                            onChange={() => handlePreviewAnswer(currentPreviewQ.id, opt.value)}
                            className="text-blue-600"
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {currentPreviewQ?.type === 'multiple_choice' && (
                    <div className="space-y-1.5">
                      {(currentPreviewQ.options || []).map((opt) => {
                        const selected = (previewAnswers[currentPreviewQ.id] || []).includes(opt.value);
                        return (
                          <label
                            key={opt.id}
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-neutral-200 p-2.5 text-xs text-neutral-800 transition hover:bg-neutral-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const current = previewAnswers[currentPreviewQ.id] || [];
                                const next = selected
                                  ? current.filter((v: string) => v !== opt.value)
                                  : [...current, opt.value];
                                handlePreviewAnswer(currentPreviewQ.id, next);
                              }}
                              className="rounded-sm text-blue-600"
                            />
                            <span>{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {currentPreviewQ?.type === 'nps' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-11 gap-1">
                        {Array.from({ length: 11 }, (_, i) => i).map((score) => (
                          <button
                            key={score}
                            type="button"
                            onClick={() => handlePreviewAnswer(currentPreviewQ.id, score)}
                            className={`flex h-8 items-center justify-center rounded-md border text-xs font-bold transition ${
                              previewAnswers[currentPreviewQ.id] === score
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-neutral-400">
                        <span>0 - Not likely</span>
                        <span>10 - Extremely likely</span>
                      </div>
                    </div>
                  )}

                  {currentPreviewQ?.type === 'rating_scale' && (
                    <div className="space-y-2">
                      <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handlePreviewAnswer(currentPreviewQ.id, star)}
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-bold transition ${
                              previewAnswers[currentPreviewQ.id] === star
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                          >
                            ★ {star}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-between text-[10px] text-neutral-400">
                        <span>{currentPreviewQ.minLabel || 'Poor'}</span>
                        <span>{currentPreviewQ.maxLabel || 'Excellent'}</span>
                      </div>
                    </div>
                  )}

                  {currentPreviewQ?.type === 'short_text' && (
                    <input
                      type="text"
                      placeholder="Type your answer here..."
                      value={previewAnswers[currentPreviewQ.id] || ''}
                      onChange={(e) => handlePreviewAnswer(currentPreviewQ.id, e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    />
                  )}

                  {currentPreviewQ?.type === 'long_text' && (
                    <textarea
                      rows={3}
                      placeholder="Write your feedback..."
                      value={previewAnswers[currentPreviewQ.id] || ''}
                      onChange={(e) => handlePreviewAnswer(currentPreviewQ.id, e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                    />
                  )}

                  {/* Survey Nav Controls */}
                  <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={previewQuestionIndex === 0}
                      onClick={() => {
                        setPreviewError(null);
                        setPreviewQuestionIndex((prev) => Math.max(0, prev - 1));
                      }}
                      className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white"
                    >
                      Back
                    </button>

                    {previewQuestionIndex < questions.length - 1 ? (
                      <button
                        type="button"
                        onClick={handlePreviewNext}
                        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePreviewSubmit}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Submit Feedback
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
