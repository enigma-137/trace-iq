import type { TraceIQReplayPrivacyMode } from '../types';

type JsonObject = Record<string, unknown>;
const REDACTED = '[redacted]';
const SENSITIVE_NAME = /(pass(word)?|passwd|card.?number|cc.?num|cvv|cvc|security.?code|secret|token|api.?key|access.?key|authorization|auth.?code|one.?time|otp|2fa|mfa|pin|session.?key|csrf)/i;
const URL_ATTRIBUTES = new Set([
  'href', 'src', 'rr_src', 'action', 'formaction', 'poster', 'background', 'cite', 'data',
  'xlink:href', 'manifest', 'profile', 'longdesc', 'usemap', 'archive', 'codebase', 'icon'
]);
const URL_LIST_ATTRIBUTES = new Set(['ping']);
const CSS_URL_ATTRIBUTES = new Set([
  'fill', 'stroke', 'filter', 'clip-path', 'mask', 'cursor',
  'marker', 'marker-start', 'marker-mid', 'marker-end'
]);
const FORM_TAGS = new Set(['input', 'textarea', 'select', 'option']);
const TEXT_ATTRIBUTES = new Set(['title', 'alt', 'placeholder', 'content', 'aria-label', 'aria-description', 'aria-valuetext']);
const SECRET_PATTERNS = [
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

export function sanitizeTransportEvent<T>(event: T, privacyMode: TraceIQReplayPrivacyMode): T {
  return sanitize(structuredClone(event), privacyMode) as T;
}

function sanitize(value: unknown, privacyMode: TraceIQReplayPrivacyMode, parentKey = '', depth = 0): unknown {
  if (depth > 128) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, privacyMode, parentKey, depth + 1));
  if (!isObject(value)) return typeof value === 'string' ? scrubSecrets(value) : value;
  const tagName = typeof value.tagName === 'string' ? value.tagName.toLowerCase() : '';
  const rawAttributes = isObject(value.attributes) ? value.attributes : undefined;
  const cssDeclaration = typeof value.property === 'string' && typeof value.value === 'string';
  const allowIframe = tagName === 'iframe'
    && rawAttributes?.['data-traceiq-allow-replay'] === 'true'
    && rawAttributes?.['data-traceiq-replay-safe-frame'] === 'true';
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (normalized === '__proto__' || normalized === 'constructor' || normalized === 'prototype') delete value[key];
    else if (SENSITIVE_NAME.test(key) || /^(?:rr_)?data_?url$/i.test(key) || normalized.includes('canvasdata')) value[key] = REDACTED;
    else if (normalized === 'attributes' && isObject(child)) value[key] = sanitizeAttributes(child, tagName, privacyMode, depth + 1);
    else if (normalized === 'data' && isObject(child) && child.source === 5) {
      value[key] = sanitize({ ...child, text: mask(child.text), value: mask(child.value) }, privacyMode, key, depth + 1);
    }
    else if (tagName === 'iframe' && !allowIframe && (normalized === 'childnodes' || normalized === 'contentdocument')) value[key] = normalized === 'childnodes' ? [] : undefined;
    else if ((normalized === 'textcontent' || (parentKey === 'texts' && normalized === 'value')) && typeof child === 'string') value[key] = privacyMode === 'strict' ? mask(child) : scrubSecrets(child);
    else if (typeof child === 'string' && ['style', '_csstext', 'csstext', 'rule', 'replace', 'replacesync', 'fontsource'].includes(normalized)) value[key] = scrubCss(child);
    else if (normalized === 'value' && cssDeclaration && typeof child === 'string') value[key] = scrubCss(child);
    else value[key] = sanitize(child, privacyMode, key, depth + 1);
  }
  if (tagName === 'iframe' && !allowIframe) {
    value.attributes = { width: rawAttributes?.width, height: rawAttributes?.height, 'data-traceiq-blocked': 'true' };
    value.childNodes = [];
  }
  return value;
}

function sanitizeAttributes(attributes: JsonObject, tagName: string, privacyMode: TraceIQReplayPrivacyMode, depth: number) {
  const next: JsonObject = {};
  for (const [key, child] of Object.entries(attributes)) {
    const normalized = key.toLowerCase();
    if (normalized === '__proto__' || normalized === 'constructor' || normalized === 'prototype') continue;
    if (SENSITIVE_NAME.test(key) || /^(?:rr_)?data_?url$/i.test(key) || normalized.includes('canvasdata')) next[key] = REDACTED;
    else if (privacyMode === 'strict' && typeof child === 'string' && isTextBearingAttribute(normalized)) next[key] = mask(child);
    else if (URL_ATTRIBUTES.has(normalized) && typeof child === 'string') next[key] = scrubUrl(child);
    else if (URL_LIST_ATTRIBUTES.has(normalized) && typeof child === 'string') next[key] = child.split(/\s+/).map(scrubUrl).join(' ');
    else if ((normalized === 'srcset' || normalized === 'imagesrcset') && typeof child === 'string') next[key] = scrubSrcSet(child);
    else if (CSS_URL_ATTRIBUTES.has(normalized) && typeof child === 'string') next[key] = scrubCss(child);
    else if (normalized === 'style' && typeof child === 'string') next[key] = scrubCss(child);
    else next[key] = sanitize(child, privacyMode, 'attributes', depth + 1);
  }
  if (FORM_TAGS.has(tagName) && 'value' in next) next.value = mask(next.value);
  if ('srcdoc' in next) next.srcdoc = '';
  return next;
}

function scrubUrl(value: string) {
  const trimmed = scrubSecrets(value.trim());
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
  } catch { return REDACTED; }
}

function scrubCss(value: string) {
  const scrubbed = scrubSecrets(value);
  return hasCssNetworkReference(scrubbed) ? '[redacted-css-url]' : scrubbed;
}

function scrubSrcSet(value: string) {
  return value.split(',').map((candidate) => {
    const [url, ...descriptor] = candidate.trim().split(/\s+/);
    return [scrubUrl(url ?? ''), ...descriptor].join(' ');
  }).join(', ');
}

function scrubSecrets(value: string) {
  let next = value;
  for (const pattern of SECRET_PATTERNS) next = next.replace(pattern, (_match, prefix) => typeof prefix === 'string' ? `${prefix}${REDACTED}` : REDACTED);
  return next;
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

function mask(value: unknown) { return typeof value === 'string' && value.length ? '*'.repeat(Math.min(value.length, 128)) : REDACTED; }
function isTextBearingAttribute(attribute: string) {
  return TEXT_ATTRIBUTES.has(attribute)
    || (attribute.startsWith('data-') && !attribute.startsWith('data-traceiq-'));
}
function isObject(value: unknown): value is JsonObject { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
