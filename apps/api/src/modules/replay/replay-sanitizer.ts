import { BadRequestException } from '@nestjs/common';
import { REPLAY_LIMITS, ReplayPrivacyMode } from './replay.constants';

type JsonObject = Record<string, unknown>;

const SENSITIVE_NAME = /(pass(word)?|passwd|card.?number|cc.?num|cvv|cvc|security.?code|secret|token|api.?key|access.?key|authorization|auth.?code|one.?time|otp|2fa|mfa|pin|session.?key|csrf)/i;
const FORM_TAGS = new Set(['input', 'textarea', 'select', 'option']);
const URL_ATTRIBUTES = new Set([
  'href', 'src', 'rr_src', 'action', 'formaction', 'poster', 'background', 'cite', 'data',
  'xlink:href', 'manifest', 'profile', 'longdesc', 'usemap', 'archive', 'codebase', 'icon'
]);
const URL_LIST_ATTRIBUTES = new Set(['ping']);
const CSS_URL_ATTRIBUTES = new Set([
  'fill', 'stroke', 'filter', 'clip-path', 'mask', 'cursor',
  'marker', 'marker-start', 'marker-mid', 'marker-end'
]);
const CSS_KEYS = new Set(['style', '_csstext', 'csstext', 'rule', 'replace', 'replacesync', 'fontsource']);
const TEXT_ATTRIBUTES = new Set(['title', 'alt', 'placeholder', 'content', 'aria-label', 'aria-description', 'aria-valuetext']);
const NETWORK_ATTRIBUTES = new Set([...URL_ATTRIBUTES, ...URL_LIST_ATTRIBUTES, ...CSS_URL_ATTRIBUTES, 'srcset', 'imagesrcset']);
const REDACTED = '[redacted]';
const OBVIOUS_SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}\b/gi,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi,
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@[^\s]+/gi,
  /\b(?:\d[ -]*?){13,19}\b/g,
  /\b((?:(?:otp|one[_ -]?time|verification|security|login|authentication)[_ -]?code)\s*(?:is|[:=])\s*)\d{4,8}\b/gi,
  /\b((?:password|passwd|secret|access[_ -]?token|refresh[_ -]?token|session[_ -]?(?:id|key)|csrf|api[_ -]?key|authorization|auth[_ -]?code|otp|one[_ -]?time[_ -]?code|(?:verification|security|login|authentication)[_ -]?code|cvv|cvc|pin)\s*[:=]?\s*)[^\s,;"'<>]{3,}/gi
];

/** Sanitizes untrusted rrweb JSON before it can be compressed or persisted. */
export function sanitizeReplayEvents(events: unknown, privacyMode: ReplayPrivacyMode): JsonObject[] {
  if (!Array.isArray(events) || events.length === 0 || events.length > REPLAY_LIMITS.maxEventsPerChunk) {
    throw new BadRequestException(`events must contain 1-${REPLAY_LIMITS.maxEventsPerChunk} rrweb events.`);
  }
  return events.map((event, index) => {
    if (!isObject(event) || !Number.isInteger(event.type) || typeof event.timestamp !== 'number') {
      throw new BadRequestException(`events[${index}] is not a valid rrweb event.`);
    }
    const eventType = event.type as number;
    if (eventType < 0 || eventType > 6 || !Number.isFinite(event.timestamp)) {
      throw new BadRequestException(`events[${index}] has an unsupported rrweb type or timestamp.`);
    }
    return sanitizeValue(structuredClone(event), privacyMode) as JsonObject;
  });
}

/** Produces a credential-free, network-inert projection for browser playback. */
export function isolateReplayEventsForPlayback(events: unknown[]): JsonObject[] {
  return events.map((event) => neutralizeNetwork(structuredClone(event)) as JsonObject);
}

function sanitizeValue(value: unknown, privacyMode: ReplayPrivacyMode, parentKey = '', depth = 0): unknown {
  if (depth > 128) throw new BadRequestException('Replay event nesting exceeds the sanitization limit.');
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, privacyMode, parentKey, depth + 1));
  if (!isObject(value)) return typeof value === 'string' ? scrubObviousSecrets(value) : value;

  const tagName = typeof value.tagName === 'string' ? value.tagName.toLowerCase() : '';
  const rawAttributes = isObject(value.attributes) ? value.attributes : undefined;
  const sensitiveElement = isSensitiveElement(tagName, rawAttributes);
  const cssDeclaration = typeof value.property === 'string' && typeof value.value === 'string';
  const allowIframe = tagName === 'iframe'
    && rawAttributes?.['data-traceiq-allow-replay'] === 'true'
    && rawAttributes?.['data-traceiq-replay-safe-frame'] === 'true';

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (normalized === '__proto__' || normalized === 'constructor' || normalized === 'prototype') {
      delete value[key];
      continue;
    }
    if (SENSITIVE_NAME.test(key) || /^(?:rr_)?data_?url$/i.test(key) || normalized.includes('canvasdata')) {
      value[key] = REDACTED;
      continue;
    }
    if (normalized === 'attributes' && isObject(child)) {
      const sanitizedAttributes = sanitizeAttributes(child, privacyMode, depth + 1);
      value[key] = FORM_TAGS.has(tagName) || sensitiveElement
        ? sanitizeFormAttributes(sanitizedAttributes)
        : sanitizedAttributes;
      continue;
    }
    if (tagName === 'iframe' && !allowIframe && (normalized === 'childnodes' || normalized === 'contentdocument')) {
      value[key] = normalized === 'childnodes' ? [] : undefined;
      continue;
    }
    if (normalized === 'data' && isObject(child) && child.source === 5) {
      value[key] = sanitizeValue({ ...child, text: mask(child.text), value: mask(child.value) }, privacyMode, key, depth + 1);
      continue;
    }
    const isText = normalized === 'textcontent' || (parentKey === 'texts' && normalized === 'value');
    if (isText && typeof child === 'string') {
      value[key] = privacyMode === 'strict' ? mask(child) : scrubObviousSecrets(child);
      continue;
    }
    if (CSS_KEYS.has(normalized) && typeof child === 'string') {
      value[key] = scrubCssUrls(scrubObviousSecrets(child));
      continue;
    }
    if (normalized === 'value' && cssDeclaration && typeof child === 'string') {
      value[key] = scrubCssUrls(child);
      continue;
    }
    value[key] = sanitizeValue(child, privacyMode, key, depth + 1);
  }

  if (tagName === 'iframe' && !allowIframe) {
    value.attributes = { width: rawAttributes?.width, height: rawAttributes?.height, 'data-traceiq-blocked': 'true' };
    value.childNodes = [];
  }
  return value;
}

function sanitizeAttributes(attributes: JsonObject, privacyMode: ReplayPrivacyMode, depth: number): JsonObject {
  const next: JsonObject = {};
  for (const [key, child] of Object.entries(attributes)) {
    const normalized = key.toLowerCase();
    if (normalized === '__proto__' || normalized === 'constructor' || normalized === 'prototype') continue;
    if (SENSITIVE_NAME.test(key) || /^(?:rr_)?data_?url$/i.test(key) || normalized.includes('canvasdata')) next[key] = REDACTED;
    else if (privacyMode === 'strict' && typeof child === 'string' && isTextBearingAttribute(normalized)) next[key] = mask(child);
    else if (URL_ATTRIBUTES.has(normalized) && typeof child === 'string') next[key] = scrubUrl(child);
    else if (URL_LIST_ATTRIBUTES.has(normalized) && typeof child === 'string') next[key] = child.split(/\s+/).map(scrubUrl).join(' ');
    else if ((normalized === 'srcset' || normalized === 'imagesrcset') && typeof child === 'string') next[key] = scrubSrcSet(child);
    else if (CSS_URL_ATTRIBUTES.has(normalized) && typeof child === 'string') next[key] = scrubCssUrls(child);
    else if (normalized === 'style' && typeof child === 'string') next[key] = scrubCssUrls(scrubObviousSecrets(child));
    else next[key] = sanitizeValue(child, privacyMode, 'attributes', depth + 1);
  }
  if ('srcdoc' in next) next.srcdoc = '';
  return next;
}

function sanitizeFormAttributes(attributes: JsonObject): JsonObject {
  const next = { ...attributes };
  if ('value' in next) next.value = mask(next.value);
  if ('placeholder' in next && SENSITIVE_NAME.test(String(next.name ?? next.id ?? next.autocomplete ?? ''))) next.placeholder = REDACTED;
  return next;
}

function neutralizeNetwork(value: unknown, parentKey = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => neutralizeNetwork(item, parentKey));
  if (!isObject(value)) {
    if (typeof value === 'string' && CSS_KEYS.has(parentKey.toLowerCase())) return neutralizeCss(value);
    return value;
  }
  const cssDeclaration = typeof value.property === 'string' && typeof value.value === 'string';
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (parentKey === 'attributes' && NETWORK_ATTRIBUTES.has(normalized)) value[key] = inertAttributeValue(normalized);
    else if (parentKey === 'attributes' && normalized === 'style' && typeof child === 'string') value[key] = neutralizeCss(child);
    else if (CSS_KEYS.has(normalized) && typeof child === 'string') value[key] = neutralizeCss(child);
    else if (normalized === 'value' && cssDeclaration && typeof child === 'string') value[key] = neutralizeCss(child);
    else value[key] = neutralizeNetwork(child, key);
  }
  return value;
}

function scrubUrl(value: string) {
  const trimmed = scrubObviousSecrets(value.trim());
  if (/^(?:javascript|data|blob|file):/i.test(trimmed)) return 'about:blank';
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//');
  try {
    const url = new URL(trimmed, 'https://replay.invalid');
    if (absolute && url.protocol !== 'http:' && url.protocol !== 'https:') return 'about:blank';
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (SENSITIVE_NAME.test(key)) url.searchParams.set(key, REDACTED);
    return absolute ? url.toString() : `${url.pathname}${url.search}`;
  } catch {
    return REDACTED;
  }
}

function scrubSrcSet(value: string) {
  return value.split(',').map((candidate) => {
    const [url, ...descriptor] = candidate.trim().split(/\s+/);
    return [scrubUrl(url ?? ''), ...descriptor].join(' ');
  }).join(', ');
}

function scrubCssUrls(value: string) {
  const scrubbed = scrubObviousSecrets(value);
  return hasCssNetworkReference(scrubbed) ? '[redacted-css-url]' : scrubbed;
}

function neutralizeCss(value: string) {
  return hasCssNetworkReference(value) ? '' : value;
}

function hasCssNetworkReference(value: string) {
  const normalized = value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi, (_match, hex, escaped) => decodeCssEscape(hex, escaped))
    .toLowerCase();
  return /@import|(?:url|image-set|src)\s*\(/.test(normalized);
}

function decodeCssEscape(hex: string | undefined, escaped: string | undefined) {
  if (!hex) return escaped ?? '';
  const codePoint = Number.parseInt(hex, 16);
  return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '\ufffd';
}

function inertAttributeValue(attribute: string) {
  if (attribute === 'href' || attribute === 'xlink:href' || attribute === 'usemap') return '#';
  if (attribute === 'action' || attribute === 'formaction') return 'about:blank';
  if (attribute === 'srcset') return 'data:,';
  return 'data:,';
}

function scrubObviousSecrets(value: string) {
  let next = value;
  for (const pattern of OBVIOUS_SECRET_PATTERNS) {
    next = next.replace(pattern, (_match, prefix) => typeof prefix === 'string' ? `${prefix}${REDACTED}` : REDACTED);
  }
  return next;
}

function isSensitiveElement(tagName: string, attributes?: JsonObject) {
  if (!attributes) return false;
  if (tagName === 'input' && ['password', 'hidden'].includes(String(attributes.type ?? '').toLowerCase())) return true;
  return SENSITIVE_NAME.test(String(attributes.name ?? attributes.id ?? attributes.autocomplete ?? attributes['aria-label'] ?? ''));
}

function isTextBearingAttribute(attribute: string) {
  return TEXT_ATTRIBUTES.has(attribute)
    || (attribute.startsWith('data-') && !attribute.startsWith('data-traceiq-'));
}

function mask(value: unknown) {
  if (typeof value !== 'string') return REDACTED;
  return value.length ? '*'.repeat(Math.min(value.length, 128)) : '';
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
