import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'metadata.google.internal',
  'instance-data',
  '169.254.169.254'
]);

const PRIVATE_BLOCKS: Array<{ network: string; prefix: number }> = [
  { network: '10.0.0.0', prefix: 8 },
  { network: '172.16.0.0', prefix: 12 },
  { network: '192.168.0.0', prefix: 16 },
  { network: '169.254.0.0', prefix: 16 },
  { network: '127.0.0.0', prefix: 8 },
  { network: '0.0.0.0', prefix: 8 },
  { network: '100.64.0.0', prefix: 10 }
];

const LINK_LOCAL_V6 = /^fe80:/i;
const UNIQUE_LOCAL_V6 = /^f[cd][0-9a-f]{2}:/i;
const MAPPED_V6 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
const MAPPED_V6_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;

/**
 * Converts the trailing 32 bits of an IPv6-mapped IPv4 (hex form, e.g.
 * "::ffff:7f00:1") back into dotted-quad IPv4. Node normalizes
 * "::ffff:127.0.0.1" into "::ffff:7f00:1", so both forms need handling.
 */
function mappedV6ToIpv4(host: string): string | null {
  const dotted = MAPPED_V6.exec(host);
  if (dotted) {
    return dotted[1];
  }

  const hex = MAPPED_V6_HEX.exec(host);
  if (!hex) {
    return null;
  }

  const value = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0);
}

export function isBlockedIpv4(ip: string): boolean {
  const mapped = MAPPED_V6.exec(ip);
  const candidate = mapped ? mapped[1] : ip;
  const int = ipv4ToInt(candidate);

  return PRIVATE_BLOCKS.some(({ network, prefix }) => {
    const shift = 32 - prefix;
    return (int >>> shift) === (ipv4ToInt(network) >>> shift);
  });
}

export function isBlockedHostname(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '');

  if (BLOCKED_HOSTS.has(normalized)) {
    return true;
  }

  // Cloud provider metadata endpoints.
  if (/\.internal$/.test(normalized)) {
    return true;
  }

  // Everything ending in .local / .localhost / .lan is not publicly routable.
  if (/(^|\.)(localhost|local|lan)$/.test(normalized)) {
    return true;
  }

  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const stripped = ip.replace(/^\[|\]$/g, '').toLowerCase();
  if (stripped === '::1' || LINK_LOCAL_V6.test(stripped) || UNIQUE_LOCAL_V6.test(stripped)) {
    return true;
  }
  if (stripped.includes(':')) {
    const mapped = mappedV6ToIpv4(stripped);
    if (mapped && isBlockedIpv4(mapped)) {
      return true;
    }
    return false;
  }
  return isBlockedIpv4(stripped);
}

/**
 * Validates that a URL is syntactically safe for the server to fetch (SSRF protection).
 * Rejects non-http(s) schemes, hostnames/IPs that resolve to private or
 * loopback space, and cloud metadata endpoints.
 */
export function assertSafeFetchUrl(input: unknown, field = 'URL'): string {
  const raw = typeof input === 'string' ? input.trim() : '';

  if (!/^https?:\/\//i.test(raw)) {
    throw new BadRequestException(`${field} must start with http:// or https://`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException(`${field} is not a valid URL.`);
  }

  const host = parsed.hostname;

  if (isBlockedHostname(host)) {
    throw new BadRequestException(`${field} targets a private or reserved host and cannot be used.`);
  }

  const strippedHost = host.replace(/^\[|\]$/g, '');
  const isIp = /^[0-9a-f:.]+$/i.test(strippedHost);
  if (isIp && isBlockedIpAddress(strippedHost)) {
    throw new BadRequestException(`${field} targets a private or reserved address and cannot be used.`);
  }

  return raw;
}

/**
 * Resolves the hostname via DNS at runtime and verifies that none of the
 * resolved IPs belong to private or loopback ranges (DNS rebinding protection).
 */
export async function assertDnsSafeUrl(rawUrl: string, field = 'URL'): Promise<string> {
  const validatedUrl = assertSafeFetchUrl(rawUrl, field);
  const parsed = new URL(validatedUrl);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');

  const isIp = /^[0-9a-f:.]+$/i.test(host);
  if (isIp) {
    if (isBlockedIpAddress(host)) {
      throw new BadRequestException(`${field} targets a private or reserved address.`);
    }
    return validatedUrl;
  }

  try {
    const addresses = await lookup(host, { all: true });
    for (const { address } of addresses) {
      if (isBlockedIpAddress(address)) {
        throw new BadRequestException(`${field} resolved to a private or reserved address and cannot be delivered to.`);
      }
    }
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    throw new BadRequestException(`${field} host could not be resolved.`);
  }

  return validatedUrl;
}
