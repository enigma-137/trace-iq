import { TraceIQReactNative } from './client';

export { TraceIQReactNative } from './client';
export type { TraceIQInitOptions, CaptureParams, IdentifyParams, GroupParams } from './client';
export { createReplayComponents } from './replay-components';
export type { ReplayFrame, ReplayNode, ReplayNodeKind, ReplayViewport } from './replay';

/** Shared singleton, mirroring the browser SDK's `traceiq` export. */
export const traceiq = new TraceIQReactNative();
