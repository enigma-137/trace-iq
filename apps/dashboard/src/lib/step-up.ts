/**
 * Step-up (re-verify 2FA) for sensitive dashboard actions.
 *
 * The API requires a second factor verified within the last 15 minutes for
 * actions such as creating access tokens, managing members and webhooks. When
 * that check is missing or stale it answers 403 with `error` set to one of
 * {@link STEP_UP_ERROR_CODES}. Callers pass such responses to
 * {@link retryAfterStepUp}, which asks the user for a fresh code through the
 * dialog registered by StepUpDialogHost and repeats the request once.
 */

export const STEP_UP_ERROR_CODES = ['STEP_UP_REQUIRED', 'STEP_UP_EXPIRED'] as const;

type StepUpVerifier = () => Promise<boolean>;

let verifier: StepUpVerifier | null = null;
let pending: Promise<boolean> | null = null;

/** Registers the UI that collects a code. Returns a function that unregisters it. */
export function registerStepUpVerifier(fn: StepUpVerifier): () => void {
  verifier = fn;
  return () => {
    if (verifier === fn) verifier = null;
  };
}

/**
 * Asks the user to re-verify their second factor. Resolves true once verified,
 * false if they cancel or no dialog is mounted. Concurrent callers share one prompt.
 */
export function requestStepUp(): Promise<boolean> {
  if (!verifier) return Promise.resolve(false);
  pending ??= verifier().finally(() => {
    pending = null;
  });
  return pending;
}

export async function isStepUpResponse(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body = (await response.clone().json()) as { error?: unknown };
    return STEP_UP_ERROR_CODES.includes(body?.error as (typeof STEP_UP_ERROR_CODES)[number]);
  } catch {
    return false;
  }
}

/**
 * Returns `response` unless the API asked for step-up. In that case it prompts
 * for a code and, once verified, returns the result of `resend()`, which must
 * read the access token again so the retry carries the refreshed session.
 */
export async function retryAfterStepUp(
  response: Response,
  resend: () => Promise<Response | null>
): Promise<Response> {
  if (!(await isStepUpResponse(response))) return response;
  if (!(await requestStepUp())) return response;
  return (await resend()) ?? response;
}
