'use client';

import { clientFetch } from '@/lib/analytics-api';

export type FeedbackKind = 'card_request' | 'idea' | 'problem' | 'other';
export type FeedbackStatus = 'new' | 'planned' | 'done' | 'declined';

/** Mirrors FeedbackItem in apps/api/src/modules/feedback/feedback.service.ts. */
export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  status: FeedbackStatus;
  userEmail: string | null;
  organizationName: string | null;
  projectName: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface FeedbackInbox {
  items: FeedbackItem[];
  unread: number;
  total: number;
}

export const KIND_LABEL: Record<FeedbackKind, string> = {
  card_request: 'Card request',
  idea: 'Idea',
  problem: 'Problem',
  other: 'Other'
};

export const KIND_TONE: Record<FeedbackKind, string> = {
  card_request: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300',
  idea: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  problem: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  other: 'bg-neutral-100 text-neutral-600 dark:bg-slate-800 dark:text-slate-300'
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'New',
  planned: 'Planned',
  done: 'Done',
  declined: 'Declined'
};

/** The bell and the inbox both listen, so a change in one shows in the other at once. */
export const FEEDBACK_CHANGED = 'traceiq:feedback-changed';

export function announceFeedbackChange(): void {
  window.dispatchEvent(new Event(FEEDBACK_CHANGED));
}

export function fetchInbox(params: { unread?: boolean; kind?: FeedbackKind | null; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.unread) query.set('unread', 'true');
  if (params.kind) query.set('kind', params.kind);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return clientFetch<FeedbackInbox>(`/v1/admin/feedback${suffix}`, { cache: 'no-store' });
}

export async function updateFeedback(id: string, body: { read?: boolean; status?: FeedbackStatus }) {
  const result = await clientFetch<{ id: string; status: FeedbackStatus; readAt: string | null }>(
    `/v1/admin/feedback/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(body) }
  );
  if (!result.error) announceFeedbackChange();
  return result;
}

export async function markAllFeedbackRead() {
  const result = await clientFetch<{ updated: number }>('/v1/admin/feedback/read-all', { method: 'POST' });
  if (!result.error) announceFeedbackChange();
  return result;
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "dev@x.com · Enigma / Nuwell · /dashboard/funnels" */
export function feedbackSource(item: FeedbackItem): string {
  const where = [item.organizationName, item.projectName].filter(Boolean).join(' / ');
  return [item.userEmail ?? 'Unknown sender', where, item.page].filter(Boolean).join(' · ');
}
