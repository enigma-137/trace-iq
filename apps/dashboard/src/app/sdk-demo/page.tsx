'use client';

import { useMemo, useState } from 'react';
import { traceiq } from '@traceiq/sdk-js';

type RecentEvent = {
  id: string;
  eventName: string;
  userId?: string;
  externalUserId?: string;
  anonymousId?: string;
  sessionId?: string;
  properties?: Record<string, unknown>;
  receivedAt?: string;
};

type SendStatus = 'idle' | 'sending' | 'sent' | 'error';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const projectId = process.env.NEXT_PUBLIC_TRACEIQ_PROJECT_ID ?? 'proj_demo';
const writeKey = process.env.NEXT_PUBLIC_TRACEIQ_WRITE_KEY ?? 'trq_dev_write_key_demo';

export default function SdkDemoPage() {
  const [status, setStatus] = useState<SendStatus>('idle');
  const [message, setMessage] = useState('Ready');
  const [events, setEvents] = useState<RecentEvent[]>([]);

  const sampleUserId = useMemo(() => `demo_user_${Date.now().toString(36)}`, []);

  async function refreshRecentEvents() {
    const response = await fetch(`${apiUrl}/v1/events/recent?projectId=${projectId}&limit=10`);
    if (!response.ok) {
      throw new Error(`Recent events failed with ${response.status}`);
    }

    const data = (await response.json()) as { events: RecentEvent[] };
    setEvents(data.events);
  }

  async function sendSignupEvent() {
    setStatus('sending');
    setMessage('Sending event');

    try {
      traceiq.initialize({
        projectId,
        writeKey,
        endpoint: apiUrl,
        debug: true
      });

      traceiq.identify({
        userId: sampleUserId,
        traits: {
          plan: 'demo',
          source: 'sdk-demo'
        }
      });

      traceiq.track('signup_completed', {
        plan: 'demo',
        surface: 'dashboard_sdk_demo',
        sentAt: new Date().toISOString()
      });

      await new Promise((resolve) => setTimeout(resolve, 900));
      await refreshRecentEvents();
      setStatus('sent');
      setMessage('Event sent');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Event send failed');
    }
  }

  return (
    <main className="sdk-demo-shell">
      <section className="sdk-demo-header">
        <div>
          <p className="sdk-demo-kicker">TraceIQ SDK</p>
          <h1>Browser Event Test</h1>
        </div>
        <a href="/" className="sdk-demo-link">
          Home
        </a>
      </section>

      <section className="sdk-demo-grid">
        <div className="sdk-demo-panel">
          <div className="sdk-demo-stack">
            <span className={`sdk-demo-status sdk-demo-status-${status}`}>{message}</span>
            <dl className="sdk-demo-config">
              <div>
                <dt>API</dt>
                <dd>{apiUrl}</dd>
              </div>
              <div>
                <dt>Project</dt>
                <dd>{projectId}</dd>
              </div>
              <div>
                <dt>User</dt>
                <dd>{sampleUserId}</dd>
              </div>
            </dl>
          </div>

          <div className="sdk-demo-actions">
            <button type="button" onClick={sendSignupEvent} disabled={status === 'sending'}>
              Send signup event
            </button>
            <button type="button" onClick={refreshRecentEvents}>
              Refresh
            </button>
          </div>
        </div>

        <div className="sdk-demo-panel">
          <div className="sdk-demo-panel-heading">
            <h2>Recent Events</h2>
            <span>{events.length}</span>
          </div>

          <div className="sdk-demo-events">
            {events.length === 0 ? (
              <p className="sdk-demo-empty">No events loaded</p>
            ) : (
              events.map((event) => (
                <article key={event.id} className="sdk-demo-event">
                  <div>
                    <strong>{event.eventName}</strong>
                    <span>{event.id}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>User</dt>
                      <dd>{event.externalUserId ?? event.userId ?? event.anonymousId ?? 'anonymous'}</dd>
                    </div>
                    <div>
                      <dt>TraceIQ user</dt>
                      <dd>{event.userId ?? 'none'}</dd>
                    </div>
                    <div>
                      <dt>Session</dt>
                      <dd>{event.sessionId ?? 'none'}</dd>
                    </div>
                    <div>
                      <dt>Received</dt>
                      <dd>{event.receivedAt ?? 'unknown'}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
