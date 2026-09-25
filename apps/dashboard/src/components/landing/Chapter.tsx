'use client';

import type { ReactNode } from 'react';
import { SceneCanvas, type SceneKind } from '@/components/webgl/SceneCanvas';

interface ChapterProps {
  id?: string;
  /** Two-digit chapter number shown in the slug. */
  index: string;
  /** Short uppercase chapter title. */
  title: string;
  scene?: SceneKind;
  sceneDensity?: number;
  sceneClassName?: string;
  /** Scrim gradient protecting the caption from the scene behind it. */
  scrim?: string;
  centered?: boolean;
  children: ReactNode;
}

/**
 * One cinematic chapter: a full-viewport WebGL scene with a caption laid over
 * it, wearing the instrument-panel slug (number, title, rule).
 *
 * Chapters carry the page's impact; the dense `panel` sections between them
 * carry the detail. Alternating the two is what keeps the page from reading
 * as eight identical blocks.
 */
export function Chapter({
  id,
  index,
  title,
  scene,
  sceneDensity = 1,
  sceneClassName = 'chapter-canvas',
  scrim,
  centered = false,
  children,
}: ChapterProps) {
  return (
    <section className="chapter" id={id}>
      {scene && (
        <SceneCanvas kind={scene} density={sceneDensity} className={sceneClassName} />
      )}
      {scrim && (
        <div className="chapter-scrim" aria-hidden="true" style={{ background: scrim }} />
      )}
      {/*
        Each chapter tunes its own scrim for a side-by-side desktop layout. On a
        phone the caption sits directly on top of the scene instead, so this
        second layer takes over there.
      */}
      {scene && <div className="chapter-scrim-mobile" aria-hidden="true" />}

      <div className={`chapter-body${centered ? ' is-centered' : ''}`}>
        <div className="chapter-slug">
          <b>{index}</b>
          <s />
          <span>{title}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

export default Chapter;
