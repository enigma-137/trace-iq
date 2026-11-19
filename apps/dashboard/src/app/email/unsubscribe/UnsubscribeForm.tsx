'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import landing from '@/app/landing-light.module.css';
import styles from './unsubscribe.module.css';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done' } | { kind: 'error'; message: string };

/**
 * Asks before unsubscribing: mail scanners open links on their own, so the link alone
 * must not unsubscribe anyone. Mail apps' one-click button posts to the API directly.
 */
export function UnsubscribeForm() {
  const params = useSearchParams();
  const email = params.get('e') ?? '';
  const token = params.get('t') ?? '';
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function unsubscribe() {
    setState({ kind: 'busy' });
    try {
      const response = await fetch(`${apiBaseUrl}/v1/email/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token })
      });
      if (response.ok) return setState({ kind: 'done' });
      const body = await response.json().catch(() => null);
      setState({ kind: 'error', message: body?.message ?? 'Something went wrong. Please try again.' });
    } catch {
      setState({ kind: 'error', message: 'We couldn’t reach TraceIQ. Check your connection and try again.' });
    }
  }

  const incomplete = !email || !token;

  return (
    <section className={`${landing.frame} ${styles.wrap}`} aria-labelledby="unsubscribe-title">
      <div className={styles.card}>
        <p className={styles.kicker}>Email preferences</p>
        {state.kind === 'done' ? (
          <>
            <h1 id="unsubscribe-title">You&rsquo;re unsubscribed.</h1>
            <p className={styles.text}>
              <strong>{email}</strong> won&rsquo;t get product-update emails any more. Alerts and briefs you set up
              yourself aren&rsquo;t affected.
            </p>
            <p className={styles.text}>
              Changed your mind? Turn product updates back on in{' '}
              <a href="/dashboard/settings#email">Settings</a>, or follow the <a href="/changelog">changelog</a>.
            </p>
          </>
        ) : incomplete ? (
          <>
            <h1 id="unsubscribe-title">This link is incomplete.</h1>
            <p className={styles.text}>
              Open the unsubscribe link from the email again, or turn off product updates in{' '}
              <a href="/dashboard/settings#email">Settings</a>.
            </p>
          </>
        ) : (
          <>
            <h1 id="unsubscribe-title">Unsubscribe from product updates?</h1>
            <p className={styles.text}>
              <strong>{email}</strong> will stop getting the monthly email about what&rsquo;s new in TraceIQ. Alerts
              and briefs you set up yourself aren&rsquo;t affected.
            </p>
            <button type="button" className={landing.button} onClick={() => void unsubscribe()} disabled={state.kind === 'busy'}>
              {state.kind === 'busy' ? 'Unsubscribing…' : 'Unsubscribe'}
            </button>
            {state.kind === 'error' ? (
              <p className={styles.error} role="alert">
                {state.message}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
