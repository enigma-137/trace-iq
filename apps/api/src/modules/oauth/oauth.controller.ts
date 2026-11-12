import { Body, Controller, Get, Headers, HttpException, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { MCP_READ_SCOPES, MCP_WRITE_SCOPES } from '../auth/scopes';
import { OAuthError, authorizationServerMetadata, withParams } from './oauth.logic';
import { AuthorizeParams, OAuthService } from './oauth.service';

/** Public base URL of this API, which is also the OAuth issuer. */
export function issuerUrl(request: Request): string {
  const configured = process.env.TRACEIQ_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const forwarded = process.env.TRUST_PROXY_HEADERS === 'true' ? request.header('x-forwarded-proto')?.split(',')[0]?.trim() : undefined;
  return `${forwarded || request.protocol}://${request.header('host') ?? 'localhost:4000'}`;
}

const dashboardUrl = () => (process.env.DASHBOARD_URL ?? 'https://traceiq.run').replace(/\/+$/, '');

function sendOAuthError(res: Response, error: unknown) {
  if (error instanceof OAuthError) {
    res.status(error.status).setHeader('Cache-Control', 'no-store');
    res.json({ error: error.error, error_description: error.description });
    return;
  }
  if (error instanceof HttpException) {
    res.status(error.getStatus()).json({ error: 'invalid_request', error_description: error.message });
    return;
  }
  res.status(500).json({ error: 'server_error', error_description: 'Something went wrong. Try again.' });
}

function authorizeParams(source: Record<string, unknown>): AuthorizeParams {
  return {
    clientId: source.client_id ?? source.clientId,
    redirectUri: source.redirect_uri ?? source.redirectUri,
    responseType: source.response_type ?? source.responseType,
    codeChallenge: source.code_challenge ?? source.codeChallenge,
    codeChallengeMethod: source.code_challenge_method ?? source.codeChallengeMethod,
    scope: source.scope,
    state: source.state,
    resource: source.resource
  };
}

/** The OAuth endpoints MCP clients talk to directly (no dashboard session). */
@Controller()
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('.well-known/oauth-authorization-server')
  metadata(@Req() req: Request) {
    return authorizationServerMetadata(issuerUrl(req));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('oauth/register')
  async register(@Body() body: Record<string, unknown>, @Res() res: Response) {
    try {
      res.status(201).json(await this.oauth.register(body ?? {}));
    } catch (error) {
      sendOAuthError(res, error);
    }
  }

  /** Sends the user to the dashboard consent page, or the error back to the client. */
  @Get('oauth/authorize')
  async authorize(@Query() query: Record<string, unknown>, @Res() res: Response) {
    try {
      const params = authorizeParams(query);
      const { redirectUri, error } = await this.oauth.checkAuthorizeRequest(params);
      if (error) {
        res.redirect(302, withParams(redirectUri, { error: error.error, error_description: error.description, state: query.state as string }));
        return;
      }
      const consent = new URL(`${dashboardUrl()}/dashboard/connect`);
      for (const key of ['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource']) {
        if (typeof query[key] === 'string') consent.searchParams.set(key, query[key] as string);
      }
      if (!consent.searchParams.has('redirect_uri')) consent.searchParams.set('redirect_uri', redirectUri);
      res.redirect(302, consent.toString());
    } catch (error) {
      // Bad client or redirect URI: show the error here rather than redirecting anywhere.
      res.status(error instanceof OAuthError ? error.status : 400).type('text/plain');
      res.send(`TraceIQ could not start sign-in: ${error instanceof Error ? error.message : 'invalid request'}`);
    }
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('oauth/token')
  async token(@Body() body: Record<string, unknown>, @Res() res: Response) {
    try {
      const result = await this.oauth.exchangeCode(body ?? {});
      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      sendOAuthError(res, error);
    }
  }
}

/** What the dashboard consent page calls, with the signed-in user's session. */
@Controller('v1/dashboard/oauth')
export class OAuthConsentController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly authService: AuthService
  ) {}

  @Get('request')
  async describe(@Query() query: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    const params = authorizeParams(query);
    const { client, redirectUri, error } = await this.oauth.checkAuthorizeRequest(params).catch((cause: unknown) => {
      throw cause instanceof OAuthError ? new HttpException(cause.description, 400) : cause;
    });
    return {
      client: { id: client.id, name: client.name },
      redirectUri,
      error: error ? error.description : null,
      readScopes: MCP_READ_SCOPES,
      writeScopes: MCP_WRITE_SCOPES
    };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('approve')
  async approve(@Body() body: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    // Same rules as creating a personal access token by hand.
    this.authService.requireSupabaseSession(user);
    this.authService.requireStepUpIfEnrolled(user);
    await this.authService.requireRole(user, ['owner', 'admin']);
    try {
      return await this.oauth.approve(user.id, { ...authorizeParams(body), allowWrites: body.allowWrites });
    } catch (error) {
      throw error instanceof OAuthError ? new HttpException(error.description, 400) : error;
    }
  }

  @Post('deny')
  async deny(@Body() body: Record<string, unknown>, @Headers('authorization') authorization?: string) {
    const user = await this.authService.getDashboardUser(authorization);
    this.authService.requireSupabaseSession(user);
    try {
      return await this.oauth.deny(authorizeParams(body));
    } catch (error) {
      throw error instanceof OAuthError ? new HttpException(error.description, 400) : error;
    }
  }
}
