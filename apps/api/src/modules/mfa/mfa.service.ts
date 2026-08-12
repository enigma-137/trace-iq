import { Injectable } from '@nestjs/common';
import { DashboardUser } from '../auth/auth.service';

export interface MfaStatus {
  registeredFactors: Array<{
    id: string;
    friendlyName?: string;
    factorType: string;
    status: string;
  }>;
  verifiedFactors: Array<{
    id: string;
    friendlyName?: string;
    factorType: string;
    createdAt?: string;
  }>;
  mfaEnabled: boolean;
  sessionMfaVerified: boolean;
  sessionMfaMethod?: string;
  sessionMfaVerifiedAt?: string;
}

@Injectable()
export class MfaService {
  status(user: DashboardUser, stepUpMaxAgeMinutes = 15): MfaStatus {
    const registeredFactors = (user.factors ?? []).map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name,
      factorType: factor.factor_type,
      status: factor.status
    }));

    const verifiedFactors = (user.factors ?? [])
      .filter((factor) => factor.status === 'verified')
      .map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name,
        factorType: factor.factor_type,
        createdAt: factor.created_at
      }));

    const mfaEntry = (user.amr ?? []).find((entry) =>
      MFA_SESSION_METHODS.some((method) => entry.method === method)
    );

    const fresh = mfaEntry != null && this.isFresh(mfaEntry.timestamp, stepUpMaxAgeMinutes);

    return {
      registeredFactors,
      verifiedFactors,
      mfaEnabled: verifiedFactors.length > 0,
      sessionMfaVerified: fresh,
      sessionMfaMethod: fresh ? mfaEntry?.method : undefined,
      sessionMfaVerifiedAt: fresh && mfaEntry ? new Date(mfaEntry.timestamp * 1000).toISOString() : undefined
    };
  }

  private isFresh(timestamp: number | undefined, maxAgeMinutes: number): boolean {
    if (timestamp == null) {
      return false;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds - timestamp <= maxAgeMinutes * 60;
  }
}

const MFA_SESSION_METHODS = ['totp', 'webauthn', 'phone', 'sms'];