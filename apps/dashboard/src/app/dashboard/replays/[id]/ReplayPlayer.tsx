'use client';

import 'rrweb-player/dist/style.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadMobilePlayback, type MobilePlayback, type MobilePlaybackPage } from '@/features/replay/mobile-player';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { MobileReplayPlayer } from './MobileReplayPlayer';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ReplayPlayer({ replayId, projectId }: { replayId: string; projectId?: string }) {
  const section = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState('Loading replay...');
  const [mobile, setMobile] = useState<MobilePlayback | null>(null);

  useEffect(() => {
    let destroyPlayer: (() => void) | undefined;
    let cancelled = false;
    const controller = new AbortController();
    setStatus('Loading replay...');
    setMobile(null);
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return setStatus('Your dashboard session expired.');

      type ReplayEvent = { type: number; timestamp: number };
      type Page = MobilePlaybackPage;
      const loadPage = async (cursor?: number): Promise<Page> => {
        const query = new URLSearchParams({ limit: '10' });
        if (projectId) query.set('projectId', projectId);
        if (cursor !== undefined) query.set('cursor', String(cursor));
        const response = await fetch(`${apiBaseUrl}/v1/dashboard/replays/${encodeURIComponent(replayId)}/playback?${query}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, credentials: 'omit', signal: controller.signal
        });
        if (!response.ok) throw new Error(`Replay could not be loaded (${response.status}).`);
        return response.json() as Promise<Page>;
      };

      let page = await loadPage();
      if (page.recordingFormat === 'mobile-structural-v1') {
        const playback = await loadMobilePlayback(page, async (cursor) => loadPage(cursor));
        if (cancelled) return;
        setMobile(playback);
        setStatus('');
        return;
      }
      if (page.recordingFormat && page.recordingFormat !== 'rrweb-json-gzip') {
        throw new Error('This replay format is not supported.');
      }
      const initial = [...page.events] as ReplayEvent[];
      while (initial.length < 2 && page.nextCursor !== null) {
        page = await loadPage(page.nextCursor);
        initial.push(...page.events as ReplayEvent[]);
      }
      if (initial.length < 2) return setStatus('This replay does not contain enough events to play.');
      const { default: RrwebPlayer } = await import('rrweb-player');
      if (cancelled || !root.current) return;
      setStatus('');
      const player = new RrwebPlayer({
        target: root.current,
        props: { events: initial as never[], autoPlay: false, showController: true, skipInactive: true,
          showWarning: false, showDebug: false, UNSAFE_replayCanvas: false,
          speedOption: [0.5, 1, 2, 4, 8], width: Math.min(1200, root.current.clientWidth), height: 675 }
      });
      destroyPlayer = () => (player as unknown as { $destroy?: () => void }).$destroy?.();
      // Append bounded API pages instead of expanding a whole replay in one response.
      const incrementalPlayer = player as unknown as { addEvent: (event: ReplayEvent) => void };
      while (!cancelled && page.nextCursor !== null) {
        page = await loadPage(page.nextCursor);
        for (const event of page.events as ReplayEvent[]) incrementalPlayer.addEvent(event);
      }
    })().catch((error: unknown) => {
      if (!cancelled && !controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Replay could not be loaded.');
    });
    return () => { cancelled = true; controller.abort(); destroyPlayer?.(); };
  }, [projectId, replayId, supabase]);

  return (
    <section ref={section} className="rounded-md border border-neutral-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">{mobile
          ? 'Mobile playback draws content-free structural placeholders; no app text or image assets are reconstructed.'
          : 'Browser playback runs in rrweb\'s sandboxed iframe. Recorded network URLs are removed by the API.'}</p>
        <button type="button" className="rounded-md border px-3 py-1.5 text-xs font-semibold"
          onClick={() => void section.current?.requestFullscreen()}>Fullscreen</button>
      </div>
      {status ? <p className="grid min-h-96 place-items-center text-sm text-neutral-500">{status}</p> : null}
      {mobile ? <MobileReplayPlayer playback={mobile} /> : null}
      <div ref={root} className={mobile ? 'hidden' : 'min-h-0 overflow-hidden rounded bg-neutral-950'} />
    </section>
  );
}
