type ApiErrorPayload = {
  message?: string | EntitlementError;
  error?: string;
};

type EntitlementError = {
  code?: string;
  resource?: string;
  message?: string;
  limit?: number;
};

export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorPayload;
    const detail = typeof body.message === 'object' ? body.message : null;

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
    if (typeof body.message === 'string') return body.message;
    return body.error ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
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
