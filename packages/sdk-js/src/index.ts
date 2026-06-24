export * from './types';
export { BrowserTraceIQClient } from './core/client';

import { BrowserTraceIQClient } from './core/client';

export const traceiq = new BrowserTraceIQClient();
