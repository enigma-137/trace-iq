'use client';

import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Copy01Icon from '@hugeicons/core-free-icons/Copy01Icon';
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon';
import Mail01Icon from '@hugeicons/core-free-icons/Mail01Icon';
import PauseIcon from '@hugeicons/core-free-icons/PauseIcon';
import PlayIcon from '@hugeicons/core-free-icons/PlayIcon';
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon';
import WebhookIcon from '@hugeicons/core-free-icons/WebhookIcon';
import { SlackLogo, TelegramLogo } from '@/components/BrandLogos';
import { deliveryLabel, deliveryOutcome } from '@/lib/alert-delivery';
import {
  alertDestinations,
  alertStatus,
  formatDate,
  formatNumber,
  formatRelative,
  humanReadableCondition,
  latestDeliveries,
  thresholdLabel,
  truncate,
  type AlertChatChannel,
  type AlertDestination,
  type AlertGroup,
  type AlertRecord,
  type DestinationKind
} from '@/lib/alert-helpers';
import { DashboardDialog } from '../DashboardDialog';

/** The small mark for a destination: the service's logo, or a neutral icon. */
export function DestinationIcon({ kind, size = 16 }: { kind: DestinationKind; size?: number }) {
  if (kind === 'telegram') return <TelegramLogo size={size} />;
  if (kind === 'slack') return <SlackLogo size={size} />;
  const icon = kind === 'email' ? Mail01Icon : kind === 'group' ? UserGroupIcon : WebhookIcon;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} className="text-neutral-500 dark:text-slate-400" />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-slate-500">{title}</h4>
      <div className="mt-1.5 text-sm text-neutral-800 dark:text-slate-200">{children}</div>
    </section>
  );
}

const secondaryButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';
const dangerButton =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30';

export function AlertDetailsModal({
  alert,
  alertsAvailable,
  groups,
  channels,
  testResult,
  busy,
  createDisabled,
  onClose,
  onTest,
  onToggle,
  onDuplicate,
  onDelete
}: {
  alert: AlertRecord | null;
  alertsAvailable: boolean;
  groups: AlertGroup[];
  channels: AlertChatChannel[];
  testResult?: { message: string; triggered: boolean } | null;
  busy: boolean;
  createDisabled: boolean;
  onClose: () => void;
  onTest: (alert: AlertRecord) => void;
  onToggle: (alert: AlertRecord) => void;
  onDuplicate: (alert: AlertRecord) => void;
  onDelete: (alert: AlertRecord) => void;
}) {
  const status = alert ? alertStatus(alert, alertsAvailable) : null;
  const destinations: AlertDestination[] = alert ? alertDestinations(alert, groups, channels) : [];
  const deliveries = alert ? latestDeliveries(alert.deliveries) : [];

  return (
    <DashboardDialog
      open={Boolean(alert)}
      title={alert?.name ?? 'Alert'}
      description={alert ? humanReadableCondition(alert) : undefined}
      maxWidthClass="max-w-xl"
      onClose={onClose}
      footer={
        alert ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <button type="button" className={dangerButton} onClick={() => onDelete(alert)} disabled={busy}>
              <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.9} />
              Delete
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={secondaryButton} onClick={() => onDuplicate(alert)} disabled={createDisabled}>
                <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.9} />
                Duplicate
              </button>
              <button type="button" className={secondaryButton} onClick={() => onToggle(alert)} disabled={!alertsAvailable || busy}>
                <HugeiconsIcon icon={alert.enabled ? PauseIcon : PlayIcon} size={14} strokeWidth={1.9} />
                {alert.enabled ? 'Pause' : 'Resume'}
              </button>
              <button type="button" className={secondaryButton} onClick={() => onTest(alert)} disabled={!alertsAvailable || busy}>
                <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={1.9} />
                {busy ? 'Testing…' : 'Test now'}
              </button>
            </div>
          </div>
        ) : undefined
      }
    >
      {alert && status ? (
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            <span className="font-mono text-xs text-neutral-600 dark:text-slate-300">{alert.eventName}</span>
          </div>

          <Section title="Latest check">
            {!alertsAvailable ? (
              <span className="text-neutral-500 dark:text-slate-400">Not checked on the Free plan.</span>
            ) : alert.lastValue !== null ? (
              <span>
                <strong className="font-semibold tabular-nums">{formatNumber(alert.lastValue)}</strong>
                <span className="text-neutral-500 dark:text-slate-400"> · threshold {thresholdLabel(alert)}</span>
                <span className="block text-xs text-neutral-500 dark:text-slate-400" title={formatDate(alert.lastEvaluatedAt)}>
                  Checked {formatRelative(alert.lastEvaluatedAt)}
                </span>
              </span>
            ) : (
              <span className="text-neutral-500 dark:text-slate-400">Waiting for the first check, which runs every few minutes.</span>
            )}
          </Section>

          <Section title="Sends to">
            {destinations.length === 0 ? (
              <span className="text-neutral-500 dark:text-slate-400">Nowhere yet.</span>
            ) : (
              <ul className="grid gap-1.5">
                {destinations.map((destination) => (
                  <li key={destination.key} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                      <DestinationIcon kind={destination.kind} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{destination.label}</span>
                      {destination.note ? <span className="block text-xs text-amber-700 dark:text-amber-400">{destination.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {deliveries.length > 0 ? (
            <Section title={`Last notified ${formatRelative(deliveries[0].sentAt)}`}>
              <ul className="grid gap-1">
                {deliveries.map((delivery, index) => {
                  const outcome = deliveryOutcome(delivery.status);
                  return (
                    <li
                      key={`${delivery.channel}-${delivery.recipient ?? index}`}
                      className={
                        outcome === 'sent'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : outcome === 'skipped'
                            ? 'text-neutral-500 dark:text-slate-400'
                            : 'text-red-700 dark:text-red-400'
                      }
                      title={delivery.error ?? undefined}
                    >
                      {deliveryLabel(delivery)} {outcome}
                      {outcome !== 'sent' && delivery.error ? ` (${truncate(delivery.error, 80)})` : ''}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {testResult ? (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                testResult.triggered
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              }`}
            >
              <HugeiconsIcon icon={testResult.triggered ? Alert02Icon : CheckmarkCircle02Icon} size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
              <span>
                <strong className="font-semibold">{testResult.triggered ? 'Would fire now. ' : 'Within limits. '}</strong>
                {testResult.message} No notification was sent.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </DashboardDialog>
  );
}
