'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MobileReplayNodeV1 } from '@traceiq/types';
import { mobileFrameAt, type MobilePlayback } from '@/features/replay/mobile-player';

const speeds = [0.5, 1, 2, 4];

export function MobileReplayPlayer({ playback }: { playback: MobilePlayback }) {
  const first = playback.events[0]?.timestamp ?? 0;
  const last = playback.events.at(-1)?.timestamp ?? first;
  const duration = Math.max(1, last - first);
  const [at, setAt] = useState(first);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const anchor = useRef({ wall: 0, replay: first });
  const frame = useMemo(() => mobileFrameAt(playback.events, at), [playback.events, at]);

  useEffect(() => {
    if (!playing) return;
    anchor.current = { wall: performance.now(), replay: at };
    let handle = 0;
    const tick = (now: number) => {
      const next = Math.min(last, anchor.current.replay + (now - anchor.current.wall) * speed);
      setAt(next);
      if (next >= last) { setPlaying(false); return; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  // Reanchor only when playback or speed changes, not on every animation tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, last]);

  const seek = (value: number) => { setPlaying(false); setAt(Math.max(first, Math.min(last, value))); };
  const step = (direction: -1 | 1) => {
    const current = frame?.eventIndex ?? 0;
    const next = playback.events[Math.max(0, Math.min(playback.events.length - 1, current + direction))];
    if (next) seek(next.timestamp);
  };
  const elapsed = Math.max(0, at - first);
  const snapshot = frame?.snapshot;
  const viewport = snapshot?.viewport;
  const width = Math.max(1, viewport?.width ?? 390);
  const height = Math.max(1, viewport?.height ?? 844);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="rounded bg-sky-500/15 px-2 py-1 font-semibold uppercase tracking-wider text-sky-300">Mobile structural</span>
          <span className="text-slate-400">{playback.runtime === 'react-native' ? 'React Native' : 'Flutter'} · {playback.platform.toUpperCase()}</span>
        </div>
        <span className="font-mono text-slate-300">{frame?.screen ?? 'Unknown screen'}</span>
      </div>

      <div className="flex min-h-[430px] items-center justify-center bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_65%)] px-4 py-6">
        {snapshot ? (
          <div className="w-full max-w-[420px] overflow-hidden rounded-[2rem] border-[7px] border-slate-700 bg-slate-900 shadow-2xl shadow-black/50"
            style={{ aspectRatio: `${width} / ${height}` }}>
            <svg className="h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
              role="img" aria-label={`Structural replay of ${frame.screen}`}>
              <rect x="0" y="0" width={width} height={height} fill="#0b1220" />
              {snapshot.nodes.map((node) => <ReplayShape key={node.id} node={node} />)}
              {frame.scroll ? (
                <g transform={`translate(${frame.scroll.x} ${frame.scroll.y})`}>
                  <circle r="18" fill="#22d3ee" fillOpacity="0.17" stroke="#22d3ee" strokeWidth="2" />
                  <path d="M0 -7 L0 7 M-5 2 L0 7 L5 2" fill="none" stroke="#67e8f9" strokeWidth="2" />
                </g>
              ) : null}
              {frame.tap ? (
                <g transform={`translate(${frame.tap.x} ${frame.tap.y})`}>
                  <circle r="21" fill="#38bdf8" fillOpacity="0.2" stroke="#7dd3fc" strokeWidth="2" />
                  <circle r="5" fill="#e0f2fe" />
                </g>
              ) : null}
              {frame.transitioning || frame.background ? (
                <g>
                  <rect x="0" y="0" width={width} height={height} fill="#020617" fillOpacity="0.86" />
                  <text x={width / 2} y={height / 2} textAnchor="middle" fill="#cbd5e1" fontSize="15">
                    {frame.background ? 'App in background' : 'Navigating…'}
                  </text>
                </g>
              ) : null}
            </svg>
          </div>
        ) : <p className="text-sm text-slate-400">No structural snapshot is available.</p>}
      </div>

      <div className="space-y-3 border-t border-slate-800 px-4 py-4">
        <input type="range" className="w-full accent-sky-400" min={0} max={duration} step={1}
          value={Math.min(duration, elapsed)} aria-label="Replay timeline"
          onChange={(event) => seek(first + Number(event.currentTarget.value))} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => step(-1)} aria-label="Previous event"
              className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">←</button>
            <button type="button" onClick={() => { if (at >= last) setAt(first); setPlaying(!playing); }}
              className="min-w-20 rounded bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400">
              {playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next event"
              className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800">→</button>
            <span className="ml-2 font-mono text-xs text-slate-400">{formatMs(elapsed)} / {formatMs(last - first)}</span>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">Speed
            <select value={speed} onChange={(event) => setSpeed(Number(event.currentTarget.value))}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
              {speeds.map((value) => <option key={value} value={value}>{value}×</option>)}
            </select>
          </label>
        </div>
      </div>
      <p className="border-t border-slate-800 px-4 py-2 text-[11px] leading-5 text-slate-400">
        Shapes are placeholders only. Text, images, inputs, and blocked content are never reconstructed.
      </p>
    </div>
  );
}

function ReplayShape({ node }: { node: MobileReplayNodeV1 }) {
  const { x, y, width, height } = node.frame;
  if (node.kind === 'box') return <rect x={x} y={y} width={width} height={height} fill="#172235" fillOpacity="0.55" stroke="#334155" strokeWidth="0.7" />;
  if (node.kind === 'text') return <rect x={x} y={y + Math.min(height / 3, 5)} width={Math.min(width, width * 0.82)}
    height={Math.min(height, 8)} rx="4" fill="#64748b" fillOpacity="0.75" />;
  if (node.kind === 'icon') return <circle cx={x + width / 2} cy={y + height / 2} r={Math.max(1, Math.min(width, height) / 3)} fill="#64748b" />;
  if (node.kind === 'image') return <g><rect x={x} y={y} width={width} height={height} rx="5" fill="#243247" stroke="#475569" />
    <path d={`M${x + width * 0.2} ${y + height * 0.7} L${x + width * 0.45} ${y + height * 0.4} L${x + width * 0.75} ${y + height * 0.72}`}
      fill="none" stroke="#64748b" strokeWidth="2" /></g>;
  if (node.kind === 'blocked') return <g><rect x={x} y={y} width={width} height={height} rx="5" fill="#334155" stroke="#64748b" strokeDasharray="5 4" />
    {width > 48 && height > 22 ? <text x={x + width / 2} y={y + height / 2 + 4} textAnchor="middle" fill="#94a3b8" fontSize="11">Hidden</text> : null}</g>;
  if (node.kind === 'input') return <rect x={x} y={y} width={width} height={height} rx="5" fill="#273449" stroke="#64748b" strokeDasharray="3 3" />;
  return <rect x={x} y={y} width={width} height={height} rx="6" fill="#0c4a6e" fillOpacity="0.45" stroke="#38bdf8" strokeWidth="1.5" />;
}

function formatMs(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
