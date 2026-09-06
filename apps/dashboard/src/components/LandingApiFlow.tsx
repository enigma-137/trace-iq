'use client';

import { useEffect, useRef, useState } from 'react';
import { SvgNodeFlowGraph } from '@/components/charts/SvgNodeFlowGraph';
import { buildApiFlowGraph } from '@/lib/apiFlowGraph';

const VIRTUAL_WIDTH = 1120;
const INITIAL_HEIGHT = 650;
const apiFlow = buildApiFlowGraph();

export function LandingApiFlow() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, height: INITIAL_HEIGHT });

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!viewport || !canvas) return;

    const updateLayout = () => {
      const scale = Math.min(viewport.clientWidth / VIRTUAL_WIDTH, 1);
      setLayout({ scale, height: canvas.scrollHeight });
    };

    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(viewport);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={viewportRef}
      className="landing-api-flow-viewport dark"
      style={{ height: Math.max(layout.height * layout.scale, 1) }}
      aria-label="Animated TraceIQ API request flow"
    >
      <div
        ref={canvasRef}
        className="landing-api-flow-canvas"
        style={{ transform: `scale(${layout.scale})` }}
      >
        <SvgNodeFlowGraph
          title="API Pipeline & Endpoint Flow Architecture"
          subtitle="Live topology across 4 architecture layers and 12 request pathways"
          columns={apiFlow.columns}
          connections={apiFlow.connections}
          className="landing-api-flow-graph"
        />
      </div>
    </div>
  );
}
