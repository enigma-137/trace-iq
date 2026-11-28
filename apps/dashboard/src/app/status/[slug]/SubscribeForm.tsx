'use client';

import { useEffect, useId, useRef, useState } from 'react';
import own from './project-status.module.css';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'sent'; email: string } | { kind: 'error'; message: string };

/** "Get updates": email sign-up for incidents and maintenance on this status page. */
export function SubscribeForm({ slug, title }: { slug: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState({ kind: 'busy' });
    try {
      const response = await fetch(`${apiBaseUrl}/v1/status/pages/${encodeURIComponent(slug)}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (response.ok) {
        setState({ kind: 'sent', email: email.trim() });
        setEmail('');
        return;
      }
      if (response.status === 429) return setState({ kind: 'error', message: 'Too many attempts. Please wait a minute and try again.' });
      const body = await response.json().catch(() => null);
      setState({ kind: 'error', message: typeof body?.message === 'string' ? body.message : 'Something went wrong. Please try again.' });
    } catch {
      setState({ kind: 'error', message: 'We couldn’t reach the server. Check your connection and try again.' });
    }
  }

  return (
    <>
      <button type="button" className={own.subscribeButton} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        Get updates
      </button>
      {open ? (
        <div id={panelId} className={own.subscribePanel} role="region" aria-label="Get updates by email">
          {state.kind === 'sent' ? (
            <p className={own.subscribeNote} role="status">
              Check <strong>{state.email}</strong> for a link to confirm. Until you click it, you won’t get any emails.
            </p>
          ) : (
            <form onSubmit={submit} className={own.subscribeForm}>
              <label className={own.subscribeLabel}>
                Email me when {title} posts an incident or maintenance
                <span className={own.subscribeRow}>
                  <input
                    ref={inputRef}
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={own.subscribeInput}
                  />
                  <button type="submit" disabled={state.kind === 'busy'} className={own.subscribeSubmit}>
                    {state.kind === 'busy' ? 'Subscribing…' : 'Subscribe'}
                  </button>
                </span>
              </label>
              {state.kind === 'error' ? (
                <p className={own.subscribeError} role="alert">
                  {state.message}
                </p>
              ) : (
                <p className={own.subscribeNote}>We’ll send a link to confirm. Every email has an unsubscribe link.</p>
              )}
            </form>
          )}
        </div>
      ) : null}
    </>
  );
}
