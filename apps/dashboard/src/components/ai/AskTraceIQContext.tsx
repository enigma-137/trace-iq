'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface EvidenceItem {
  type: string;
  id: string;
  title: string;
  url: string;
  summary?: string;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  evidence?: EvidenceItem[];
  suggestedFollowups?: string[];
  createdAt?: string;
}

export interface QuotaStatus {
  plan: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  isExhausted: boolean;
}

export interface OpenAskOptions {
  surface?: string;
  entityId?: string;
  contextTitle?: string;
  initialQuestion?: string;
  filters?: Record<string, unknown>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

interface AskTraceIQContextValue {
  isOpen: boolean;
  openAsk: (options?: OpenAskOptions) => void;
  closeAsk: () => void;
  toggleAsk: () => void;
  messages: ChatMessage[];
  isInvestigating: boolean;
  progressStep: string | null;
  activeContext: OpenAskOptions | null;
  quota: QuotaStatus | null;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  error: string | null;
  submitQuestion: (question: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  refreshQuota: () => Promise<void>;
}

const AskTraceIQContext = createContext<AskTraceIQContextValue | null>(null);

export function AskTraceIQProvider({
  projectId,
  children
}: {
  projectId?: string | null;
  children: React.ReactNode;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [activeContext, setActiveContext] = useState<OpenAskOptions | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getSessionToken = useCallback(async () => {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  }, [supabase]);

  const refreshQuota = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(
        `${apiBaseUrl}/v1/dashboard/ai/quota${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (res.ok) {
        const data = (await res.json()) as QuotaStatus;
        setQuota(data);
      }
    } catch {
      // Ignore quota fetch errors
    }
  }, [getSessionToken, projectId]);

  const fetchConversations = useCallback(async () => {
    try {
      const token = await getSessionToken();
      if (!token) return;
      const res = await fetch(
        `${apiBaseUrl}/v1/dashboard/ai/conversations${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (res.ok) {
        const data = (await res.json()) as ConversationSummary[];
        setConversations(data);
      }
    } catch {
      // Ignore conversation list errors
    }
  }, [getSessionToken, projectId]);

  useEffect(() => {
    if (isOpen) {
      void refreshQuota();
      void fetchConversations();
    }
  }, [isOpen, refreshQuota, fetchConversations]);

  // Global Cmd+K keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const selectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      setIsInvestigating(true);
      setError(null);
      try {
        const token = await getSessionToken();
        if (!token) return;
        const res = await fetch(
          `${apiBaseUrl}/v1/dashboard/ai/conversations/${encodeURIComponent(id)}${
            projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
          }`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        if (res.ok) {
          const loadedMessages = (await res.json()) as ChatMessage[];
          setMessages(loadedMessages);
        }
      } catch (err: any) {
        setError(err?.message || 'Could not load conversation.');
      } finally {
        setIsInvestigating(false);
      }
    },
    [getSessionToken, projectId]
  );

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setProgressStep(null);
    setError(null);
  }, []);

  const openAsk = useCallback(
    (options?: OpenAskOptions) => {
      setIsOpen(true);
      if (options) {
        setActiveContext(options);
        if (options.initialQuestion) {
          // If starting with initial question, trigger it
          startNewConversation();
        }
      }
    },
    [startNewConversation]
  );

  const closeAsk = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleAsk = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const submitQuestion = useCallback(
    async (questionText: string) => {
      const q = questionText.trim();
      if (!q || isInvestigating) return;

      setIsInvestigating(true);
      setProgressStep('Investigating project data…');
      setError(null);

      // Optimistic user message
      const userMessage: ChatMessage = {
        id: `temp_${Date.now()}`,
        role: 'user',
        content: q,
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, userMessage]);

      const token = await getSessionToken();
      if (!token) {
        setError('Your session expired. Please log in again.');
        setIsInvestigating(false);
        setProgressStep(null);
        return;
      }

      try {
        const payload = {
          question: q,
          conversationId: activeConversationId || undefined,
          projectId: projectId || undefined,
          surface: activeContext?.surface || 'global',
          contextType: activeContext?.surface,
          contextId: activeContext?.entityId,
          filters: activeContext?.filters
        };

        const res = await fetch(`${apiBaseUrl}/v1/dashboard/ai/ask`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errText = await readApiError(res);
          setError(errText);
          return;
        }

        const result = await res.json();
        setActiveConversationId(result.conversationId);

        const assistantMessage: ChatMessage = {
          id: `resp_${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          evidence: result.evidence || [],
          suggestedFollowups: result.suggestedFollowups || [],
          createdAt: new Date().toISOString()
        };

        setMessages((prev) => [...prev, assistantMessage]);
        void refreshQuota();
        void fetchConversations();
      } catch (err: any) {
        setError(err?.message || 'Investigation request failed.');
      } finally {
        setIsInvestigating(false);
        setProgressStep(null);
      }
    },
    [
      isInvestigating,
      activeConversationId,
      projectId,
      activeContext,
      getSessionToken,
      refreshQuota,
      fetchConversations
    ]
  );

  const value = useMemo(
    () => ({
      isOpen,
      openAsk,
      closeAsk,
      toggleAsk,
      messages,
      isInvestigating,
      progressStep,
      activeContext,
      quota,
      conversations,
      activeConversationId,
      error,
      submitQuestion,
      selectConversation,
      startNewConversation,
      refreshQuota
    }),
    [
      isOpen,
      openAsk,
      closeAsk,
      toggleAsk,
      messages,
      isInvestigating,
      progressStep,
      activeContext,
      quota,
      conversations,
      activeConversationId,
      error,
      submitQuestion,
      selectConversation,
      startNewConversation,
      refreshQuota
    ]
  );

  return <AskTraceIQContext.Provider value={value}>{children}</AskTraceIQContext.Provider>;
}

export function useAskTraceIQ() {
  const context = useContext(AskTraceIQContext);
  if (!context) {
    throw new Error('useAskTraceIQ must be used within an AskTraceIQProvider');
  }
  return context;
}
