import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';

export interface DashboardUser {
  id: string;
  email?: string;
}

interface SupabaseJwtPayload {
  sub?: string;
  email?: string;
  exp?: number;
}

@Injectable()
export class AuthService {
  getDashboardUser(authorizationHeader?: string): DashboardUser {
    const token = this.getBearerToken(authorizationHeader);
    const payload = this.verifySupabaseJwt(token);

    if (!payload.sub) {
      throw new UnauthorizedException('Supabase token is missing a subject.');
    }

    return {
      id: payload.sub,
      email: payload.email
    };
  }

  private getBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    return authorizationHeader.slice('Bearer '.length).trim();
  }

  private verifySupabaseJwt(token: string): SupabaseJwtPayload {
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;

    if (!jwtSecret) {
      throw new UnauthorizedException('SUPABASE_JWT_SECRET is not configured.');
    }

    const [encodedHeader, encodedPayload, signature] = token.split('.');

    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid bearer token.');
    }

    const header = this.decodeJson<{ alg?: string }>(encodedHeader);

    if (header.alg !== 'HS256') {
      throw new UnauthorizedException('Unsupported Supabase token algorithm.');
    }

    const expectedSignature = Buffer.from(
      createHmac('sha256', jwtSecret).update(`${encodedHeader}.${encodedPayload}`).digest()
    ).toString('base64url');

    if (!this.safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid bearer token signature.');
    }

    const payload = this.decodeJson<SupabaseJwtPayload>(encodedPayload);
    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp <= nowInSeconds) {
      throw new UnauthorizedException('Bearer token has expired.');
    }

    return payload;
  }

  private decodeJson<T>(encoded: string): T {
    try {
      return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException('Invalid bearer token encoding.');
    }
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}

