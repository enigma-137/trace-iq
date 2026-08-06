import { HttpMethod, JsonObject, JsonValue } from './types.js';

const API_KEY = process.env.TRACEIQ_API_KEY;
const API_URL = (process.env.TRACEIQ_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const DEFAULT_TIMEOUT_MS = Number(process.env.TRACEIQ_MCP_TIMEOUT_MS ?? 30_000);
const DEFAULT_RETRIES = Number(process.env.TRACEIQ_MCP_RETRIES ?? 2);

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status = 0, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  query?: Record<string, unknown>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

/**
 * Centralized HTTP client for the TraceIQ dashboard API.
 *
 * One place owns authentication (Bearer PAT), JSON encoding, timeouts,
 * retries with exponential backoff, error normalization, and response
 * parsing. Every tool funnels through this so behaviours stay consistent
 * and future tools are trivial to add.
 */
export async function request<T extends JsonValue = JsonValue>(
  method: HttpMethod,
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = buildUrl(path, options.query);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) {
      await sleep(backoff(attempt));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      const text = await response.text();
      const data = text ? safeJson(text) : null;

      if (!response.ok) {
        const message = extractErrorMessage(data, response.status);
        if (!isRetryable(response.status)) {
          throw new ApiError(message, response.status, data);
        }
        // Retryable server/rate-limit status — fall through to retry.
        lastError = new ApiError(message, response.status, data);
        continue;
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) {
        // Non-retryable 4xx surfaced by the block above.
        throw error;
      }
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      if (attempt < retries) {
        lastError = new ApiError(
          aborted ? `TraceIQ request timed out after ${timeoutMs}ms.` : `TraceIQ request failed: ${messageOf(error)}`
        );
        continue;
      }
      throw lastError ?? error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('TraceIQ request failed.');
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function backoff(attempt: number): number {
  return Math.min(250 * 2 ** (attempt - 1), 4_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof (data as JsonObject).message === 'string') {
    return (data as JsonObject).message as string;
  }
  return `TraceIQ API request failed with HTTP ${status}.`;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown error';
}

function buildUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function safeJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return text;
  }
}

export function ensureConfigured(): void {
  if (!API_KEY) {
    throw new Error('TRACEIQ_API_KEY must be set to a TraceIQ personal access token.');
  }
}

export { API_KEY, API_URL };