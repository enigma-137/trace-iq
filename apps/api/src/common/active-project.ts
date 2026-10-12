import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Header the dashboard sends with the project the user last switched to.
 * It is only a soft preference: an explicit `projectId` on the request always
 * wins, and a stale or inaccessible id silently falls back to the default.
 */
export const ACTIVE_PROJECT_HEADER = 'x-traceiq-project-id';

const storage = new AsyncLocalStorage<{ projectId: string | null }>();

export function activeProjectMiddleware(req: Request, _res: Response, next: NextFunction) {
  const raw = req.headers[ACTIVE_PROJECT_HEADER];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  storage.run({ projectId: value ? value.slice(0, 200) : null }, () => next());
}

export function getPreferredProjectId(): string | null {
  return storage.getStore()?.projectId ?? null;
}
