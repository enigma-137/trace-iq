'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';

export interface UserPreviewData {
  id: string;
  externalId?: string | null;
  anonymousId?: string | null;
  distinctId: string;
  displayName: string;
  emailMasked?: string | null;
  email?: string | null;
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastOs?: string | null;
  lastDeviceType?: string | null;
  lastBrowser?: string | null;
  lastCountry?: string | null;
  lastCity?: string | null;
  traitsPreview?: Record<string, string | number | boolean>;
  traits?: Record<string, unknown>;
  eventCount?: number;
  isMissing?: boolean;
}

export function formatShortId(id: string): string {
  if (!id) return '';
  if (id.length <= 14) return id;
  const prefix = id.slice(0, 7);
  const suffix = id.slice(-4);
  return `${prefix}...${suffix}`;
}

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

export function UserDetailHoverCard({
  user,
  anchorEl,
  isOpen,
  onMouseEnter,
  onMouseLeave
}: {
  user: UserPreviewData | null;
  anchorEl: HTMLElement | null;
  isOpen: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; side: 'right' | 'left' }>({
    top: 0,
    left: 0,
    side: 'right'
  });
  const [showFullEmail, setShowFullEmail] = useState(false);

  useEffect(() => {
    if (!isOpen || !anchorEl) return;

    function updatePosition() {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const cardWidth = 290;
      const cardHeight = 240;
      const gap = 12;

      let left = rect.right + gap;
      let side: 'right' | 'left' = 'right';

      // If overflowing right edge of viewport, flip to left
      if (left + cardWidth > window.innerWidth - 16) {
        left = Math.max(16, rect.left - cardWidth - gap);
        side = 'left';
      }

      // Vertical alignment: center with row, bounded within viewport
      let top = rect.top + rect.height / 2 - cardHeight / 2;
      if (top < 16) top = 16;
      if (top + cardHeight > window.innerHeight - 16) {
        top = Math.max(16, window.innerHeight - cardHeight - 16);
      }

      setCoords({ top, left, side });
    }

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, anchorEl]);

  if (!isOpen || !user) return null;

  function copyText(txt: string, label: string) {
    void navigator.clipboard.writeText(txt);
    toast.success(`Copied ${label} to clipboard.`);
  }

  const traits = user.traitsPreview || (user.traits as Record<string, string | number | boolean>) || {};
  const traitEntries = Object.entries(traits).filter(
    ([k]) => !['name', 'full_name', 'email', 'id', 'userId', 'distinctId'].includes(k)
  );

  const displayEmail = showFullEmail ? user.email || user.emailMasked : user.emailMasked;

  return (
    <div
      ref={cardRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 9999
      }}
      className="w-[290px] animate-in fade-in-0 zoom-in-95 duration-150 rounded-xl border border-neutral-200/90 bg-white/95 p-4 text-xs shadow-xl backdrop-blur-md dark:border-slate-800/90 dark:bg-slate-950/95"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-neutral-100 pb-3 dark:border-slate-800/60">
        <div className="min-w-0 pr-2">
          <h4 className="truncate text-sm font-bold text-neutral-900 dark:text-white">
            {user.displayName || 'Unknown User'}
          </h4>
          <span className="mt-0.5 inline-block text-[11px] text-neutral-500 dark:text-slate-400">
            {user.isMissing ? 'User record missing/deleted' : `Last seen ${formatRelativeTime(user.lastSeenAt)}`}
          </span>
        </div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
          Target User
        </span>
      </div>

      {/* Primary Identity Details */}
      <div className="mt-3 space-y-2">
        {/* Distinct ID */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-neutral-500 dark:text-slate-400">Distinct ID</span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-neutral-800 dark:text-slate-200" title={user.distinctId}>
              {formatShortId(user.distinctId)}
            </span>
            <button
              type="button"
              onClick={() => copyText(user.distinctId, 'Distinct ID')}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              title="Copy full distinct ID"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
        </div>

        {/* Email */}
        {user.emailMasked || user.email ? (
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-neutral-500 dark:text-slate-400">Email</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-neutral-800 dark:text-slate-200">{displayEmail}</span>
              {user.email ? (
                <button
                  type="button"
                  onClick={() => setShowFullEmail(!showFullEmail)}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                  title={showFullEmail ? 'Mask email' : 'Reveal email'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => copyText(user.email || user.emailMasked || '', 'Email')}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                title="Copy email"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
            </div>
          </div>
        ) : null}

        {/* Location & Platform */}
        {(user.lastCountry || user.lastOs || user.lastBrowser) && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-neutral-500 dark:text-slate-400">Context</span>
            <span className="text-neutral-700 dark:text-slate-300">
              {[user.lastCountry, user.lastOs, user.lastBrowser].filter(Boolean).join(' • ')}
            </span>
          </div>
        )}
      </div>

      {/* Traits Preview Chips */}
      {traitEntries.length > 0 ? (
        <div className="mt-3 border-t border-neutral-100 pt-2.5 dark:border-slate-800/60">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-slate-500">
            Known Traits
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {traitEntries.slice(0, 6).map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <span className="text-neutral-400 dark:text-slate-500">{k}:</span>
                <span className="font-semibold">{String(v)}</span>
              </span>
            ))}
            {traitEntries.length > 6 ? (
              <span className="text-[10px] text-neutral-400 self-center">+{traitEntries.length - 6} more</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
