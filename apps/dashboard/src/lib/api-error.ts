type ApiErrorPayload = {
  message?: string | string[] | EntitlementError;
  error?: string;
  code?: string;
  resource?: string;
  limit?: number;
};

type EntitlementError = {
  code?: string;
  resource?: string;
  message?: string;
  limit?: number;
};

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Normalizes API responses and thrown fetch/network errors for inline UI and toasts. */
export async function readApiError(source: unknown, fallback = DEFAULT_ERROR_MESSAGE): Promise<string> {
  if (!isResponse(source)) return readThrownError(source, fallback);

  const body = await readPayload(source);
  const messageDetail = body && !Array.isArray(body.message) && typeof body.message === 'object'
    ? body.message
    : null;
  const detail: EntitlementError | null = messageDetail ?? (body?.code
    ? {
        code: body.code,
        resource: body.resource,
        limit: body.limit,
        message: typeof body.message === 'string' ? body.message : undefined
      }
    : null);

  if (detail?.code === 'MONTHLY_EVENT_LIMIT_REACHED') {
    return `This organization has reached its monthly event allowance${formatLimit(detail.limit)}. Open Settings → Billing to upgrade.`;
  }
  if (detail?.code === 'ENTITLEMENT_REQUIRED') {
    return `Your plan limit for ${friendlyResource(detail.resource)} has been reached${formatLimit(detail.limit)}. Open Settings → Billing to upgrade.`;
  }
  if (detail?.code === 'RESOURCE_READ_ONLY') {
    return detail.message ?? 'This resource is read-only because the organization exceeds its current plan. Reduce usage or upgrade in Settings → Billing.';
  }

  if (detail?.message) return detail.message;
  if (Array.isArray(body?.message)) return body.message.filter(Boolean).join(' ');
  if (typeof body?.message === 'string') return body.message;
  if (body?.error && !isGenericHttpLabel(body.error)) return body.error;
  return statusMessage(source.status, fallback);
}

async function readPayload(response: Response): Promise<ApiErrorPayload | null> {
  try {
    const raw = await response.text();
    if (!raw || raw.length > 50_000) return null;

    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? parsed as ApiErrorPayload : null;
  } catch {
    return null;
  }
}

function readThrownError(source: unknown, fallback: string) {
  if (isAbortError(source)) return 'The request was cancelled.';
  if (isNetworkError(source)) return 'Unable to reach TraceIQ. Check your connection and try again.';
  if (source instanceof Error && source.message.trim()) return source.message;
  if (typeof source === 'string' && source.trim()) return source.trim();
  return fallback;
}

function isResponse(value: unknown): value is Response {
  return typeof Response !== 'undefined' && value instanceof Response;
}

function isAbortError(value: unknown) {
  return value instanceof Error && value.name === 'AbortError';
}

function isNetworkError(value: unknown) {
  if (!(value instanceof Error)) return false;
  return value instanceof TypeError || /failed to fetch|network(?: request)? failed|load failed|fetch failed/i.test(value.message);
}

function isGenericHttpLabel(value: string) {
  return /^(bad request|unauthorized|forbidden|not found|conflict|too many requests|internal server error)$/i.test(value.trim());
}

function statusMessage(status: number, fallback: string) {
  if (status === 401) return 'Your dashboard session expired. Sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested resource could not be found.';
  if (status === 409) return 'This change conflicts with the current state. Refresh and try again.';
  if (status === 413) return 'The submitted data is too large.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'TraceIQ is temporarily unavailable. Please try again shortly.';
  return status > 0 ? `Request failed with ${status}.` : fallback;
}

function friendlyResource(resource?: string) {
  const labels: Record<string, string> = {
    projects: 'projects',
    members: 'team members',
    aiInsights: 'AI insights',
    events: 'events'
  };
  return labels[resource ?? ''] ?? resource ?? 'this feature';
}

function formatLimit(limit?: number) {
  return typeof limit === 'number' ? ` (${limit.toLocaleString()} included)` : '';
}
