'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import landing from '@/app/landing-light.module.css';
import own from '../project-status.module.css';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type State = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; title: string | null } | { kind: 'error'; message: string };

/**
 * Confirm or unsubscribe from a status page's emails. Asks for a click first: mail
 * scanners open links on their own, so opening the link must not change anything.
 */
export function SubscriptionAction({ slug }: { slug: string }) {
  const params = useSearchParams();
  const action = params.get('action') === 'unsubscribe' ? 'unsubscribe' : 'confirm';
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>({ kind: 'idle' });
  const statusHref = `/status/${encodeURIComponent(slug)}`;

  async function run() {
    setState({ kind: 'busy' });
    try {
      const response = await fetch(`${apiBaseUrl}/v1/status/subscribers/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const body = await response.json().catch(() => null);
      if (response.ok) return setState({ kind: 'done', title: typeof body?.page?.title === 'string' ? body.page.title : null });
      setState({ kind: 'error', message: typeof body?.message === 'string' ? body.message : 'Something went wrong. Please try again.' });
    } catch {
      setState({ kind: 'error', message: 'We couldn’t reach the server. Check your connection and try again.' });
    }
  }

  return (
    <div className={`${landing.site} ${own.page}`}>
      <main>
        <section className={own.result} aria-labelledby="subscription-title">
          {!token ? (
            <>
              <h1 id="subscription-title">This link is incomplete.</h1>
              <p>Open the link from the email again.</p>
            </>
          ) : state.kind === 'done' ? (
            action === 'confirm' ? (
              <>
                <h1 id="subscription-title">You&rsquo;re subscribed.</h1>
                <p>
                  You&rsquo;ll get an email when {state.title ?? 'this page'} posts an incident or scheduled maintenance, and
                  when it&rsquo;s updated. Every email has an unsubscribe link.
                </p>
              </>
            ) : (
              <>
                <h1 id="subscription-title">You&rsquo;re unsubscribed.</h1>
                <p>You won&rsquo;t get any more emails from {state.title ?? 'this status page'}.</p>
              </>
            )
          ) : (
            <>
              <h1 id="subscription-title">{action === 'confirm' ? 'Confirm your subscription?' : 'Unsubscribe from status updates?'}</h1>
              <p>
                {action === 'confirm'
                  ? 'You’ll get an email when this status page posts an incident or scheduled maintenance.'
                  : 'You’ll stop getting emails about incidents and maintenance on this status page.'}
              </p>
              <button type="button" className={landing.button} onClick={() => void run()} disabled={state.kind === 'busy'}>
                {state.kind === 'busy' ? 'One moment…' : action === 'confirm' ? 'Confirm subscription' : 'Unsubscribe'}
              </button>
              {state.kind === 'error' ? (
                <p className={own.subscribeError} role="alert">
                  {state.message}
                </p>
              ) : null}
            </>
          )}
          <p className={own.subscribeNote}>
            <a href={statusHref}>Back to the status page</a>
          </p>
        </section>
      </main>
    </div>
  );
}
