'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { type DemoCompany, type DemoRange, isDemoCategory, normalizeCompanyName } from '@/lib/demo-data';

const STORAGE_KEY = 'traceiq-demo-company';

interface DemoContextValue {
  /** Null until the visitor names their company in the modal. */
  company: DemoCompany | null;
  /** False on the server and the first client render, before storage is read. */
  ready: boolean;
  range: DemoRange;
  setRange: (range: DemoRange) => void;
  /** Fixed when the demo opens so every page samples the same window. */
  now: Date;
  saveCompany: (company: DemoCompany) => void;
  modalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

function readStoredCompany(): DemoCompany | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object' && 'name' in parsed && 'category' in parsed) {
      const { name, category } = parsed as { name: unknown; category: unknown };
      if (typeof name === 'string' && isDemoCategory(category)) {
        return { name: normalizeCompanyName(name), category };
      }
    }
  } catch {
    // Private mode or blocked storage: the modal simply asks again.
  }
  return null;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<DemoCompany | null>(null);
  const [ready, setReady] = useState(false);
  const [range, setRange] = useState<DemoRange>('30d');
  const [modalOpen, setModalOpen] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    const stored = readStoredCompany();
    setCompany(stored);
    setModalOpen(!stored);
    setReady(true);
  }, []);

  const saveCompany = useCallback((next: DemoCompany) => {
    const normalized = { name: normalizeCompanyName(next.name), category: next.category };
    setCompany(normalized);
    setModalOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Not persisted; the demo still works for this visit.
    }
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      company,
      ready,
      range,
      setRange,
      now,
      saveCompany,
      modalOpen,
      openModal: () => setModalOpen(true),
      closeModal: () => setModalOpen(false)
    }),
    [company, ready, range, now, saveCompany, modalOpen]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo must be used inside DemoProvider');
  return value;
}

/** The demo pages only render once a company is set, so they can rely on it. */
export function useDemoCompany(): DemoCompany {
  const { company } = useDemo();
  if (!company) throw new Error('Demo page rendered without a company');
  return company;
}
