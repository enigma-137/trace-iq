'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';

export type FirstEventStatus = 'idle' | 'listening' | 'received' | 'expired' | 'error';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Listens for a project's first event, the same way the setup wizard does: open a short-lived
 * verification session, then wait on its event stream for `verified`.
 * Starts when `enabled` turns true, stops when it turns false or the component unmounts.
 */
export function useFirstEventListener({
  projectId,
  enabled,
  onReceived
}: {
  projectId: string;
  enabled: boolean;
  onReceived?: () => void;
}) {
  const [status, setStatus] = useState<FirstEventStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const runRef = useRef(0);
  const onReceivedRef = useRef(onReceived);
  onReceivedRef.current = onReceived;

  const stop = useCallback(() => {
    runRef.current += 1; // invalidates any start that is still waiting on the network
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    const run = runRef.current;
    setStatus('listening');
    setError(null);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const {
        data: { session }
      } = await createSupabaseBrowserClient().auth.getSession();
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(`${apiUrl}/v1/setup-verifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ projectId, ttlSeconds: 300 })
      });
      if (!res.ok) throw new Error(await readApiError(res, 'Could not start listening for your first event.'));
      const data = await res.json();
      if (run !== runRef.current) return; // closed or restarted while the request was in flight

      const source = new EventSource(`${apiUrl}/v1/setup-verifications/${data.id || data.verificationId}/events`);
      sourceRef.current = source;
      source.addEventListener('verified', () => {
        source.close();
        setStatus('received');
        onReceivedRef.current?.();
      });
      source.addEventListener('expired', () => {
        source.close();
        setStatus('expired');
      });
    } catch (err) {
      if (run !== runRef.current) return;
      setError(err instanceof Error ? err.message : 'Could not start listening for your first event.');
      setStatus('error');
    }
  }, [projectId, stop]);

  useEffect(() => {
    if (!enabled) {
      stop();
      setStatus((current) => (current === 'received' ? current : 'idle'));
      return;
    }
    void start();
    return stop;
  }, [enabled, start, stop]);

  return { status, error, restart: start };
}
