import { Injectable, Logger } from '@nestjs/common';

export interface SlackSendResult {
  ok: boolean;
  status: number;
  description?: string;
  // The webhook can never work again (channel archived, app removed, URL revoked).
  permanent: boolean;
}

export interface SlackInstall {
  webhookUrl: string;
  channelId: string;
  channelName: string;
  teamName: string | null;
}

const OAUTH_AUTHORIZE = 'https://slack.com/oauth/v2/authorize';
const OAUTH_ACCESS = 'https://slack.com/api/oauth.v2.access';
const TIMEOUT_MS = 10_000;
const DEFAULT_REDIRECT = 'https://api.traceiq.run/v1/integrations/slack/callback';

/** Slack incoming webhooks only ever live on this host. Anything else is refused. */
export function isSlackWebhookUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'hooks.slack.com' && url.pathname.startsWith('/services/');
  } catch {
    return false;
  }
}

/** Thin wrapper over Slack's OAuth and incoming-webhook APIs. Configured by SLACK_CLIENT_ID / SLACK_CLIENT_SECRET. */
@Injectable()
export class SlackClient {
  private readonly logger = new Logger(SlackClient.name);

  private get clientId(): string {
    return (process.env.SLACK_CLIENT_ID ?? '').trim();
  }

  private get clientSecret(): string {
    return (process.env.SLACK_CLIENT_SECRET ?? '').trim();
  }

  get redirectUri(): string {
    return (process.env.SLACK_REDIRECT_URL ?? '').trim() || DEFAULT_REDIRECT;
  }

  get isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /** The "Add to Slack" URL. `state` is our one-time code, returned to the callback unchanged. */
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      scope: 'incoming-webhook',
      redirect_uri: this.redirectUri,
      state
    });
    return `${OAUTH_AUTHORIZE}?${params.toString()}`;
  }

  /** Trades the one-time `code` Slack sent to the callback for the channel's webhook URL. */
  async exchangeCode(code: string): Promise<{ install: SlackInstall } | { error: string }> {
    try {
      const response = await fetch(OAUTH_ACCESS, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        team?: { name?: string };
        incoming_webhook?: { url?: string; channel?: string; channel_id?: string };
      };
      const hook = body.incoming_webhook;
      if (!body.ok || !hook || !isSlackWebhookUrl(hook.url) || !hook.channel_id) {
        return { error: body.error ?? 'invalid_response' };
      }
      return {
        install: {
          webhookUrl: hook.url,
          channelId: hook.channel_id,
          channelName: hook.channel ?? hook.channel_id,
          teamName: body.team?.name ?? null
        }
      };
    } catch (error) {
      // Never log the request: it carries the client secret and the code.
      this.logger.warn(`Slack code exchange failed: ${error instanceof Error ? error.message : 'network error'}`);
      return { error: 'network_error' };
    }
  }

  async sendMessage(webhookUrl: string, text: string): Promise<SlackSendResult> {
    if (!isSlackWebhookUrl(webhookUrl)) {
      return { ok: false, status: 0, description: 'Not a Slack webhook URL.', permanent: true };
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (response.ok) return { ok: true, status: response.status, permanent: false };
      const description = (await response.text().catch(() => '')).slice(0, 200) || `Slack returned ${response.status}.`;
      // 403/404/410 (revoked, no_service, channel_is_archived) never recover; 429 and 5xx do.
      const permanent = response.status === 403 || response.status === 404 || response.status === 410;
      return { ok: false, status: response.status, description, permanent };
    } catch (error) {
      // Never log the URL: it is the secret.
      this.logger.warn(`Slack post failed: ${error instanceof Error ? error.message : 'network error'}`);
      return { ok: false, status: 0, description: 'Could not reach Slack.', permanent: false };
    }
  }
}
