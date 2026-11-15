/**
 * Status for each card on Settings → Integrations. Pure, so the pill and detail text are testable.
 */
import { statusLabel, type LinearStatusResponse } from './linear';
import type { GitHubStatusResponse } from './github-integration';

export type BriefKind = 'telegram' | 'slack';
export type IntegrationKey = 'github' | 'linear' | 'slack' | 'telegram';

export type Tone = 'success' | 'warning' | 'neutral' | 'danger';
export interface TileState {
  pill: { tone: Tone; text: string };
  detail?: string;
  connected: boolean;
  available: boolean;
}

/** Which dialog to open when a provider sends the person back here (`?github=`, `?linear=`, `?slack=`). */
export function returningIntegration(params: URLSearchParams): IntegrationKey | null {
  if (params.has('github')) return 'github';
  if (params.has('linear')) return 'linear';
  if (params.has('slack')) return 'slack';
  return null;
}

export function githubTile(status: GitHubStatusResponse): TileState {
  if (!status.connected || !status.installation) {
    return status.configured
      ? { pill: { tone: 'neutral', text: 'Not connected' }, connected: false, available: true }
      : { pill: { tone: 'neutral', text: 'Not available' }, detail: 'Not set up on this TraceIQ server yet.', connected: false, available: false };
  }
  if (status.installation.status === 'suspended') {
    return { pill: { tone: 'warning', text: 'Suspended' }, detail: `On ${status.installation.accountLogin}`, connected: true, available: true };
  }
  return {
    pill: { tone: 'success', text: 'Installed' },
    detail: status.projectRepo ? status.projectRepo.repoFullName : `On ${status.installation.accountLogin} · no repository linked`,
    connected: true,
    available: true
  };
}

export function linearTile(status: LinearStatusResponse): TileState {
  if (!status.configured && !status.connected) {
    return { pill: { tone: 'neutral', text: 'Not available' }, detail: 'Not set up on this TraceIQ server yet.', connected: false, available: false };
  }
  const label = statusLabel(status.status);
  const settings = status.projects?.find((item) => item.projectId === status.project?.id);
  const workspace = status.workspace?.name ?? null;
  const team = settings ? settings.teamKey ?? settings.teamName : null;
  const detail = status.connected ? [workspace, team ? `team ${team}` : 'no team picked'].filter(Boolean).join(' · ') : undefined;
  return { pill: label, detail, connected: status.connected, available: true };
}

export function briefTile(kind: BriefKind, configured: boolean, chats: number): TileState {
  const noun = kind === 'slack' ? 'channel' : 'chat';
  if (chats > 0) return { pill: { tone: 'success', text: `${chats} ${noun}${chats === 1 ? '' : 's'}` }, connected: true, available: true };
  if (!configured) {
    return { pill: { tone: 'neutral', text: 'Not available' }, detail: 'Not set up on this TraceIQ server yet.', connected: false, available: false };
  }
  return { pill: { tone: 'neutral', text: 'Not connected' }, connected: false, available: true };
}

