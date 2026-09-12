import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { appConfig } from '../../config/app.config';
import { ReplayUploadClaims } from './interfaces/replay.interface';

@Injectable()
export class ReplayTokenService {
  private secret?: string;

  sign(claims: Omit<ReplayUploadClaims, 'version' | 'tokenId' | 'issuedAt' | 'expiresAt'>, lifetimeSeconds: number) {
    const issuedAt = Math.floor(Date.now() / 1_000);
    const payload: ReplayUploadClaims = {
      ...claims,
      version: 2,
      tokenId: randomUUID(),
      issuedAt,
      expiresAt: issuedAt + lifetimeSeconds
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return { token: `${encoded}.${this.signature(encoded)}`, expiresAt: new Date(payload.expiresAt * 1_000).toISOString() };
  }

  verify(token: string): ReplayUploadClaims {
    const [encoded, suppliedSignature, extra] = token.split('.');
    if (!encoded || !suppliedSignature || extra) throw new UnauthorizedException('Replay upload token is malformed.');
    const expected = Buffer.from(this.signature(encoded), 'base64url');
    const supplied = Buffer.from(suppliedSignature, 'base64url');
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new UnauthorizedException('Replay upload token is invalid.');
    }
    let claims: ReplayUploadClaims;
    try {
      claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ReplayUploadClaims;
    } catch {
      throw new UnauthorizedException('Replay upload token is malformed.');
    }
    const now = Math.floor(Date.now() / 1_000);
    if (claims.version !== 2 || !claims.tokenId || !claims.projectId || !claims.organizationId || !claims.sessionId
      || (claims.replayId && (typeof claims.replayId !== 'string' || !/^rpl_[A-Za-z0-9_-]{1,160}$/.test(claims.replayId)))
      || !Array.isArray(claims.matchedFunnelIds) || claims.matchedFunnelIds.length === 0
      || claims.matchedFunnelIds.some((id) => typeof id !== 'string' || !/^fnl_[A-Za-z0-9_-]{1,156}$/.test(id))
      || !Number.isInteger(claims.issuedAt) || !Number.isInteger(claims.expiresAt)
      || claims.issuedAt > now + 30 || claims.expiresAt <= now) {
      throw new UnauthorizedException('Replay upload token is expired or invalid.');
    }
    return claims;
  }

  private signature(value: string) {
    this.secret ??= loadSecret();
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }
}

function loadSecret() {
  const configured = process.env.REPLAY_UPLOAD_TOKEN_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (appConfig.deploymentMode === 'cloud') {
    throw new Error('REPLAY_UPLOAD_TOKEN_SECRET must contain at least 32 characters in Cloud mode.');
  }
  // A process-local fallback is safe for private self-hosting. Tokens simply
  // expire early after a restart; no credential is written to disk or logged.
  return randomBytes(32).toString('base64url');
}
