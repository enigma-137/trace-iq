'use client';

import { useEffect, useRef, useState } from 'react';
import { hasWebGL, mountScene, type SceneBuilder } from '@/components/webgl/runtime';

export type SceneKind = 'traces-hero' | 'traces-ambient' | 'morph' | 'horizon' | 'pipeline';

export interface SceneCanvasProps {
  kind: SceneKind;
  /** Scales particle counts for smaller or secondary placements. */
  density?: number;
  /**
   * Live 0..1 scroll progress for scroll-driven scenes. A mutable ref so the
   * driving component can update it on every scroll event without re-rendering.
   */
  progress?: { current: number };
  className?: string;
}

/**
 * Mounts one WebGL scene into a container.
 *
 * three.js and the scene modules are dynamically imported, so none of this is
 * in the initial bundle: the page paints its real content first and the scene
 * crossfades in once it is ready. Where WebGL is unavailable the container
 * simply stays empty and whatever sits behind it — a CSS gradient poster, or
 * the section background — is what the visitor gets.
 */
export function SceneCanvas({ kind, density = 1, progress, className }: SceneCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  // Scroll-driven scenes read this every frame; default it so a scene that
  // wants progress still works when a caller does not supply any.
  const fallbackProgress = useRef(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !hasWebGL()) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    const load = async (): Promise<[typeof import('three'), SceneBuilder, number]> => {
      const THREE = await import('three');
      switch (kind) {
        case 'morph': {
          const { createMorphScene } = await import('@/components/webgl/scenes/morph');
          return [THREE, createMorphScene, 8.8];
        }
        case 'horizon': {
          const { createHorizonScene } = await import('@/components/webgl/scenes/horizon');
          return [THREE, createHorizonScene, 9.4];
        }
        case 'pipeline': {
          const { createPipelineScene } = await import('@/components/webgl/scenes/pipeline');
          return [THREE, createPipelineScene, 9.6];
        }
        case 'traces-ambient': {
          const { createTracesScene } = await import('@/components/webgl/scenes/traces');
          return [THREE, createTracesScene('ambient'), 10];
        }
        default: {
          const { createTracesScene } = await import('@/components/webgl/scenes/traces');
          return [THREE, createTracesScene('hero'), 9.2];
        }
      }
    };

    load().then(([THREE, builder, cameraZ]) => {
      if (disposed || !mountRef.current) return;
      cleanup = mountScene(THREE, mount, builder, () => setReady(true), {
        density,
        cameraZ,
        progress: progress ?? fallbackProgress,
      });
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [kind, density, progress]);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      className={className}
      style={{
        opacity: ready ? 1 : 0,
        transition: 'opacity 1100ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    />
  );
}

export default SceneCanvas;
