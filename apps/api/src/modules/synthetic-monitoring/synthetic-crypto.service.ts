import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class SyntheticCryptoService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly masterKey: Buffer;

  constructor() {
    // Derive a fixed 32-byte (256-bit) encryption key
    const rawSecret =
      process.env.TRACEIQ_SECRET_ENCRYPTION_KEY ||
      process.env.TRACEIQ_WRITE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      'traceiq-default-dev-synthetic-secret-key-salt-32b';

    this.masterKey = createHash('sha256').update(rawSecret).digest();
  }

  encrypt(plaintext: string): { encryptedValue: string; iv: string; tag: string } {
    const iv = randomBytes(12); // 96-bit IV for AES-GCM
    const cipher = createCipheriv(this.algorithm, this.masterKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return {
      encryptedValue: encrypted,
      iv: iv.toString('hex'),
      tag
    };
  }

  decrypt(encryptedValue: string, ivHex: string, tagHex: string): string {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, this.masterKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Replaces occurrences of {{VARIABLE_NAME}} in text with decrypted secret values.
   */
  interpolate(template: string, secrets: Record<string, string>): string {
    if (!template || typeof template !== 'string') return template;
    return template.replace(/\{\{([A-Za-z0-9_-]+)\}\}/g, (match, varName) => {
      if (Object.prototype.hasOwnProperty.call(secrets, varName)) {
        return secrets[varName];
      }
      return match;
    });
  }

  /**
   * Redacts sensitive secret values and generic tokens from logs/strings.
   */
  redact(input: string, secretValues: string[] = []): string {
    if (!input || typeof input !== 'string') return input;

    let result = input;

    // 1. Redact specific registered secret values
    for (const secret of secretValues) {
      if (secret && secret.length >= 3) {
        result = result.split(secret).join('[REDACTED]');
      }
    }

    // 2. Redact common token and authorization header patterns
    result = result.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi, '[REDACTED_AUTH]');
    result = result.replace(/\b(?:password|passwd|secret|api[_ -]?key|token)\s*[:=]\s*["']?([^"'\s,;]+)["']?/gi, '$1=[REDACTED]');
    result = result.replace(/([?&](?:key|api_key|token|auth|secret|password)=)[^&]+/gi, '$1[REDACTED]');

    return result;
  }
}
