'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import { AchievementView } from './types';
import { AchievementShareCard } from './AchievementShareCard';

interface AchievementDialogProps {
  achievement: AchievementView | null;
  onClose: () => void;
}

export function AchievementDialog({ achievement, onClose }: AchievementDialogProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!achievement) return;
    setImageLoaded(false);
    setError(null);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [achievement, onClose]);

  if (!achievement || typeof document === 'undefined') {
    return null;
  }

  const active = achievement;

  async function download() {
    const node = cardRef.current;
    if (!node) return;
    setDownloading(true);
    setError(null);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#0b0d12',
        cacheBust: true
      });
      triggerDownload(dataUrl, `${active.slug}-achievement.png`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not generate the share image.');
    } finally {
      setDownloading(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-neutral-950/45 px-4 py-8 backdrop-blur-sm dark:bg-black/70"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-2xl shadow-neutral-950/20 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby="achievement-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="achievement-dialog-title" className="text-lg font-semibold tracking-normal text-neutral-950 dark:text-white">
              {achievement.title}
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">Download a share card and post it anywhere.</p>
          </div>
          <button
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white text-lg leading-none text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:bg-slate-800 dark:hover:text-white"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div ref={cardRef} className="mt-5">
          <AchievementShareCard achievement={achievement} onLoad={() => setImageLoaded(true)} />
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-bold text-white transition hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200"
            onClick={download}
            disabled={downloading || !imageLoaded}
          >
            {downloading ? 'Rendering…' : 'Download PNG'}
          </button>
        </div>

        {error ? <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      </section>
    </div>,
    document.body
  );
}

function triggerDownload(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
