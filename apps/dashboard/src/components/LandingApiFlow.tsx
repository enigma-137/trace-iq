'use client';

import { SvgNodeFlowGraph } from '@/components/charts/SvgNodeFlowGraph';
import { buildApiFlowGraph } from '@/lib/apiFlowGraph';

const apiFlow = buildApiFlowGraph();

export function LandingApiFlow() {
  return (
    <div
      className="landing-api-flow-viewport w-full dark"
      aria-label="Animated TraceIQ API request flow"
    >
      <SvgNodeFlowGraph
        columns={apiFlow.columns}
        connections={apiFlow.connections}
        className="landing-api-flow-graph w-full"
      />
    </div>
  );
}

