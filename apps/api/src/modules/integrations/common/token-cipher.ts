import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SyntheticCryptoService } from '../../synthetic-monitoring/synthetic-crypto.service';

const PREFIX = 'v1';

/**
 * Encrypts third-party tokens at rest with the server's AES-256-GCM helper
 * (keyed by TRACEIQ_SECRET_ENCRYPTION_KEY). Values are packed into one column as
 * `v1.<iv>.<tag>.<ciphertext>` (hex).
 */
@Injectable()
export class TokenCipher {
  constructor(private readonly crypto: SyntheticCryptoService = new SyntheticCryptoService()) {}

  /**
   * The shared helper falls back to a development key when no key is set. That is
   * fine for local self-hosting, but OAuth tokens on TraceIQ Cloud must use a real key.
   */
  assertConfigured(): void {
    if (process.env.TRACEIQ_DEPLOYMENT_MODE === 'cloud' && !(process.env.TRACEIQ_SECRET_ENCRYPTION_KEY ?? '').trim()) {
      throw new ServiceUnavailableException('TRACEIQ_SECRET_ENCRYPTION_KEY must be set before connecting integrations.');
    }
  }

  encrypt(plaintext: string): string {
    const { encryptedValue, iv, tag } = this.crypto.encrypt(plaintext);
    return `${PREFIX}.${iv}.${tag}.${encryptedValue}`;
  }

  decrypt(packed: string): string {
    const parts = packed.split('.');
    if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error('Encrypted token has an unknown format.');
    const [, iv, tag, value] = parts;
    return this.crypto.decrypt(value, iv, tag);
  }
}
