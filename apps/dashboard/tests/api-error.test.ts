import { describe, expect, it } from 'vitest';
import { readApiError } from '../src/lib/api-error';

describe('readApiError', () => {
  it('turns a project entitlement response into an upgrade instruction', async () => {
    const response = new Response(JSON.stringify({
      message: { code: 'ENTITLEMENT_REQUIRED', resource: 'projects', limit: 1 }
    }), { status: 403 });

    await expect(readApiError(response)).resolves.toBe(
      'Your plan limit for projects has been reached (1 included). Open Settings → Billing to upgrade.'
    );
  });

  it('joins validation messages without exposing a generic HTTP label', async () => {
    const response = new Response(JSON.stringify({
      message: ['Project name is required.', 'Project name is too long.'],
      error: 'Bad Request'
    }), { status: 400 });

    await expect(readApiError(response)).resolves.toBe('Project name is required. Project name is too long.');
  });

  it('uses a safe status message when a server returns non-JSON content', async () => {
    const response = new Response('<html>proxy error</html>', { status: 503 });

    await expect(readApiError(response)).resolves.toBe(
      'TraceIQ is temporarily unavailable. Please try again shortly.'
    );
  });

  it('preserves a specific top-level read-only explanation', async () => {
    const response = new Response(JSON.stringify({
      code: 'RESOURCE_READ_ONLY',
      message: 'Existing data is available, but changes are disabled on the current plan.'
    }), { status: 403 });

    await expect(readApiError(response)).resolves.toBe(
      'Existing data is available, but changes are disabled on the current plan.'
    );
  });

  it('normalizes thrown fetch failures', async () => {
    await expect(readApiError(new TypeError('Failed to fetch'))).resolves.toBe(
      'Unable to reach TraceIQ. Check your connection and try again.'
    );
  });
});
