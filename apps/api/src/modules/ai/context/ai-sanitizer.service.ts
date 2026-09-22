import { Injectable } from '@nestjs/common';

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /token/i,
  /apikey/i,
  /api_key/i,
  /ssn/i,
  /credit[-_]?card/i,
  /cvv/i,
  /private[-_]?key/i,
  /jwt/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /session[-_]?token/i
];

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const JWT_REGEX = /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*\b/g;
const BEARER_REGEX = /\bBearer\s+[A-Za-z0-9-_.~+/]+=*\b/gi;
const IP_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;

@Injectable()
export class AiSanitizerService {
  private readonly maxStringLength = 1_000;
  private readonly maxDepth = 6;

  /**
   * Defensive text sanitization that masks emails, JWTs, IPs, and tokens.
   */
  sanitizeText(text: string | null | undefined): string {
    if (!text) return '';
    let sanitized = String(text);

    if (sanitized.length > this.maxStringLength) {
      sanitized = sanitized.slice(0, this.maxStringLength) + '…';
    }

    sanitized = sanitized.replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]');
    sanitized = sanitized.replace(JWT_REGEX, '[REDACTED_JWT]');
    sanitized = sanitized.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');
    sanitized = sanitized.replace(CREDIT_CARD_REGEX, '[REDACTED_PAYMENT]');
    sanitized = sanitized.replace(IP_REGEX, '[REDACTED_IP]');

    return sanitized;
  }

  /**
   * Recursively sanitizes structured objects, stripping sensitive keys and sanitizing values.
   */
  sanitizeData<T>(input: T, depth = 0): T {
    if (input === null || input === undefined) {
      return input;
    }

    if (depth > this.maxDepth) {
      return '[MAX_DEPTH_REACHED]' as unknown as T;
    }

    if (typeof input === 'string') {
      return this.sanitizeText(input) as unknown as T;
    }

    if (typeof input === 'number' || typeof input === 'boolean') {
      return input;
    }

    if (Array.isArray(input)) {
      return input.map((item) => this.sanitizeData(item, depth + 1)) as unknown as T;
    }

    if (typeof input === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (this.isSensitiveKey(key)) {
          sanitizedObj[key] = '[REDACTED]';
        } else {
          sanitizedObj[key] = this.sanitizeData(value, depth + 1);
        }
      }
      return sanitizedObj as T;
    }

    return input;
  }

  private isSensitiveKey(key: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
  }
}
