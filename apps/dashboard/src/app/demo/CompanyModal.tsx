'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DEMO_CATEGORY_OPTIONS, type DemoCategory } from '@/lib/demo-data';
import { useDemo } from './DemoContext';

export function CompanyModal() {
  const { company, saveCompany, closeModal } = useDemo();
  const [name, setName] = useState(company?.name ?? '');
  const [category, setCategory] = useState<DemoCategory>(company?.category ?? 'saas');
  const inputRef = useRef<HTMLInputElement>(null);
  // The first visit has nothing to go back to, so the modal can't be dismissed then.
  const dismissible = Boolean(company);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissible, closeModal]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      inputRef.current?.focus();
      return;
    }
    saveCompany({ name, category });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/50 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) closeModal();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-modal-title"
        onSubmit={submit}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-6"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-600 dark:text-blue-400">Live demo</p>
        <h2 id="demo-modal-title" className="mt-1 text-xl font-semibold tracking-tight text-neutral-900 dark:text-white">
          {dismissible ? 'Change the demo company' : 'See TraceIQ with your company'}
        </h2>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-slate-400">
          We fill the dashboard with sample traffic shaped like your business. Nothing is sent anywhere and no account is needed.
        </p>

        <label className="mt-5 block text-xs font-semibold text-neutral-700 dark:text-slate-300" htmlFor="demo-company-name">
          Company name
        </label>
        <input
          ref={inputRef}
          id="demo-company-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          autoComplete="organization"
          placeholder="e.g. Northwind"
          required
          className="mt-1.5 h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
        />

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold text-neutral-700 dark:text-slate-300">Category</legend>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEMO_CATEGORY_OPTIONS.map((option) => {
              const selected = option.value === category;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 transition ${
                    selected
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-500/10'
                      : 'border-neutral-200 hover:border-neutral-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="demo-category"
                    value={option.value}
                    checked={selected}
                    onChange={() => setCategory(option.value)}
                    className="mt-0.5 accent-blue-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-900 dark:text-white">{option.label}</span>
                    <span className="block text-xs text-neutral-500 dark:text-slate-400">{option.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {dismissible ? (
            <button
              type="button"
              onClick={closeModal}
              className="h-10 rounded-md px-3 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => saveCompany({ name: 'Acme Inc.', category })}
              className="h-10 rounded-md px-3 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
            >
              Skip, use a sample company
            </button>
          )}
          <button
            type="submit"
            className="h-10 rounded-md bg-neutral-900 px-5 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {dismissible ? 'Update demo' : 'Open the demo →'}
          </button>
        </div>
      </form>
    </div>
  );
}
