import { BadRequestException } from '@nestjs/common';
import * as dns from 'node:dns/promises';
import * as net from 'node:net';

export interface SsrfValidationOptions {
  allowLocal?: boolean;
}

/**
 * Enterprise-grade SSRF (Server-Side Request Forgery) protection engine.
 * Validates URLs against:
 * 1. Unsafe protocols (blocks file:, ftp:, gopher:, javascript:, data:, etc.)
 * 2. Embedded credentials (http://user:pass@evil.com)
 * 3. Dangerous non-HTTP ports (SSH 22, SMTP 25, Redis 6379, Postgres 5432, Mongo 27017, Docker 2375, etc.)
 * 4. IPv4 Loopback, Private (RFC 1918), Link-local / Cloud Metadata (169.254.169.254), Broadcast, Zero-net
 * 5. IPv6 Loopback (::1), Private Unique Local (fc00::/7), Link-local (fe80::/10)
 * 6. IPv4-Mapped IPv6 (::ffff:127.0.0.1, ::ffff:10.0.0.1, etc.)
 * 7. Alternative IP representations (hex, octal, decimal integer 2130706433)
 * 8. DNS rebinding & domains resolving to private/internal IP addresses
 */
export class SyntheticSsrfValidator {
  private static readonly BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata.google.internal',
    '169.254.169.254',
    'instance-data',
    'metadata.azure.com',
    '100.100.100.200' // Alibaba metadata
  ]);

  private static readonly FORBIDDEN_PORTS = new Set([
    20, 21, 22, 23, 25, 53, 69, 110, 111, 123, 135, 137, 138, 139, 143, 161,
    389, 445, 465, 587, 636, 1433, 1434, 1521, 2049, 2375, 2376, 2379, 2380,
    3306, 5000, 5432, 5900, 5984, 6379, 6443, 7001, 8000, 8080, 8443, 8500,
    9000, 9042, 9092, 9200, 9300, 11211, 27017, 27018, 28017
  ]);

  /**
   * Synchronous syntactic & static validation.
   */
  static validateUrl(targetUrl: string, options?: SsrfValidationOptions): { url: string; origin: string; hostname: string } {
    if (!targetUrl || typeof targetUrl !== 'string') {
      throw new BadRequestException('Target URL is required and must be a string.');
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      throw new BadRequestException(`Invalid target URL format: "${targetUrl}"`);
    }

    // Protocol check: Only HTTP and HTTPS
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException(`Forbidden protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted.`);
    }

    // Embedded user credentials forbidden
    if (parsed.username || parsed.password) {
      throw new BadRequestException('URLs with embedded authentication credentials are not permitted.');
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const allowLocal = options?.allowLocal ?? (process.env.ALLOW_LOCAL_SYNTHETIC_TARGETS === 'true');

    // Port check (when port is explicitly specified)
    if (parsed.port) {
      const portNum = parseInt(parsed.port, 10);
      if (!allowLocal && this.FORBIDDEN_PORTS.has(portNum)) {
        throw new BadRequestException(`Access to port ${portNum} is blocked for security reasons.`);
      }
    }

    if (!allowLocal) {
      if (this.BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
        throw new BadRequestException(`SSRF Protection: Access to host "${hostname}" is blocked.`);
      }

      // Check numeric/hex/octal/standard IP literals
      if (this.isRestrictedIp(hostname)) {
        throw new BadRequestException(`SSRF Protection: Access to restricted IP address "${hostname}" is blocked.`);
      }
    }

    return {
      url: parsed.href,
      origin: parsed.origin,
      hostname
    };
  }

  /**
   * Asynchronous DNS-resolving SSRF validator.
   * Resolves the target hostname to all IPv4/IPv6 addresses and verifies none point to private/internal networks.
   */
  static async validateUrlAsync(targetUrl: string, options?: SsrfValidationOptions): Promise<{ url: string; origin: string; resolvedIps: string[] }> {
    const { url, origin, hostname } = this.validateUrl(targetUrl, options);
    const allowLocal = options?.allowLocal ?? (process.env.ALLOW_LOCAL_SYNTHETIC_TARGETS === 'true');

    if (allowLocal) {
      return { url, origin, resolvedIps: [] };
    }

    // If hostname is already a valid public IP literal, return
    if (net.isIP(hostname)) {
      if (this.isRestrictedIp(hostname)) {
        throw new BadRequestException(`SSRF Protection: Hostname resolves to restricted IP "${hostname}".`);
      }
      return { url, origin, resolvedIps: [hostname] };
    }

    // Perform DNS lookup
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      const resolvedIps = addresses.map((a) => a.address);

      if (resolvedIps.length === 0) {
        throw new BadRequestException(`Could not resolve hostname "${hostname}".`);
      }

      for (const ip of resolvedIps) {
        if (this.isRestrictedIp(ip)) {
          throw new BadRequestException(`SSRF Protection: Hostname "${hostname}" resolves to private/internal IP "${ip}".`);
        }
      }

      return { url, origin, resolvedIps };
    } catch (dnsErr: any) {
      if (dnsErr instanceof BadRequestException) throw dnsErr;
      throw new BadRequestException(`DNS resolution failed for "${hostname}": ${dnsErr.message}`);
    }
  }

  /**
   * Determines if an IP string or numeric representation is in a private, loopback, link-local, or metadata range.
   */
  static isRestrictedIp(ipStr: string): boolean {
    const cleanIp = ipStr.trim().toLowerCase().replace(/^\[|\]$/g, '');

    // 1. Check for IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
    if (cleanIp.startsWith('::ffff:') || cleanIp.startsWith('0:0:0:0:0:ffff:')) {
      const mapped = cleanIp.replace(/^(::ffff:|0:0:0:0:0:ffff:)/, '');
      if (mapped.includes('.')) {
        return this.isRestrictedIp(mapped);
      }
      const hexParts = mapped.split(':');
      if (hexParts.length === 2) {
        const high16 = parseInt(hexParts[0], 16);
        const low16 = parseInt(hexParts[1], 16);
        if (!isNaN(high16) && !isNaN(low16)) {
          const octet1 = (high16 >>> 8) & 255;
          const octet2 = high16 & 255;
          return this.isRestrictedIpv4Octets(octet1, octet2);
        }
      }
      return true; // Block any other unexpected ::ffff: addresses defensively
    }

    // 2. Check for IPv6 Loopback, Link-Local, Unique-Local, Documentation, Discard
    if (cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1' || cleanIp === '::') {
      return true; // Loopback or unspecified
    }
    if (cleanIp.startsWith('fe80:') || cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) {
      return true; // IPv6 Link-local (fe80::/10)
    }
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) {
      return true; // IPv6 Unique Local (fc00::/7)
    }
    if (cleanIp.startsWith('2001:db8:')) {
      return true; // IPv6 Documentation
    }

    // 3. Check for 32-bit Hex integer (0x7f000001)
    if (/^0x[0-9a-f]+$/i.test(cleanIp)) {
      const num = parseInt(cleanIp, 16);
      if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
        const octet1 = (num >>> 24) & 255;
        const octet2 = (num >>> 16) & 255;
        return this.isRestrictedIpv4Octets(octet1, octet2);
      }
    }

    // 4. Check for pure decimal integer (e.g. 2130706433 -> 127.0.0.1) or 32-bit octal (017700000001)
    if (/^\d+$/.test(cleanIp)) {
      // If starts with 0 and length > 1, parse as octal or decimal
      let num = parseInt(cleanIp, 10);
      if (cleanIp.startsWith('0') && cleanIp.length > 1 && /^[0-7]+$/.test(cleanIp)) {
        const octalNum = parseInt(cleanIp, 8);
        if (!isNaN(octalNum) && octalNum >= 0 && octalNum <= 0xffffffff) {
          num = octalNum;
        }
      }
      if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
        const octet1 = (num >>> 24) & 255;
        const octet2 = (num >>> 16) & 255;
        return this.isRestrictedIpv4Octets(octet1, octet2);
      }
    }

    // 5. Check dotted formats: 1 to 4 parts (supports decimal, octal with leading 0, hex with 0x)
    if (cleanIp.includes('.')) {
      const parts = cleanIp.split('.');
      if (parts.length >= 2 && parts.length <= 4) {
        const parsedParts: number[] = [];
        let valid = true;
        for (const part of parts) {
          let val = NaN;
          if (/^0x[0-9a-f]+$/i.test(part)) {
            val = parseInt(part, 16);
          } else if (/^0[0-7]+$/.test(part)) {
            val = parseInt(part, 8);
          } else if (/^\d+$/.test(part)) {
            val = parseInt(part, 10);
          }
          if (isNaN(val) || val < 0) {
            valid = false;
            break;
          }
          parsedParts.push(val);
        }

        if (valid && parsedParts.length === 4) {
          const octet1 = parsedParts[0] & 255;
          const octet2 = parsedParts[1] & 255;
          return this.isRestrictedIpv4Octets(octet1, octet2);
        } else if (valid && parsedParts.length === 2) {
          // Shortened 2-part IPv4 (e.g. 127.1 -> 127.0.0.1)
          const octet1 = parsedParts[0] & 255;
          const low24 = parsedParts[1];
          const octet2 = (low24 >>> 16) & 255;
          return this.isRestrictedIpv4Octets(octet1, octet2);
        } else if (valid && parsedParts.length === 3) {
          // Shortened 3-part IPv4 (e.g. 127.0.1 -> 127.0.0.1)
          const octet1 = parsedParts[0] & 255;
          const octet2 = parsedParts[1] & 255;
          return this.isRestrictedIpv4Octets(octet1, octet2);
        }
      }
    }

    return false;
  }

  private static isRestrictedIpv4Octets(octet1: number, octet2: number): boolean {
    // 0.0.0.0/8 (Current network)
    if (octet1 === 0) return true;

    // 127.0.0.0/8 (Loopback)
    if (octet1 === 127) return true;

    // 10.0.0.0/8 (Private)
    if (octet1 === 10) return true;

    // 172.16.0.0/12 (Private: 172.16.0.0 - 172.31.255.255)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;

    // 192.168.0.0/16 (Private)
    if (octet1 === 192 && octet2 === 168) return true;

    // 169.254.0.0/16 (Link-local / Cloud metadata)
    if (octet1 === 169 && octet2 === 254) return true;

    // 100.64.0.0/10 (Carrier-grade NAT / shared space: 100.64.0.0 - 100.127.255.255)
    if (octet1 === 100 && octet2 >= 64 && octet2 <= 127) return true;

    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (TEST-NET)
    if (octet1 === 192 && octet2 === 0) return true;
    if (octet1 === 198 && octet2 === 51) return true;
    if (octet1 === 203 && octet2 === 0) return true;

    // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
    if (octet1 >= 224 && octet1 <= 239) return true;

    // 240.0.0.0/4 (Reserved / Future use)
    if (octet1 >= 240) return true;

    return false;
  }
}
