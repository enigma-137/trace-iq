// Resolves the labels analytics tables show (browser and OS names, referrer
// domains, traffic sources) to an icon. Well-known brands come from simple-icons
// and ship in the bundle; anything else with a domain falls back to its favicon
// through /api/favicon, and a label with neither gets a letter badge.

import {
  siAndroid,
  siApple,
  siBaidu,
  siBluesky,
  siBrave,
  siClaude,
  siDevdotto,
  siDiscord,
  siDuckduckgo,
  siFacebook,
  siFirefoxbrowser,
  siGithub,
  siGitlab,
  siGoogle,
  siGooglechrome,
  siGooglegemini,
  siIndiehackers,
  siInstagram,
  siLinux,
  siMastodon,
  siMedium,
  siOpera,
  siPerplexity,
  siPinterest,
  siProducthunt,
  siReddit,
  siSafari,
  siStackoverflow,
  siSubstack,
  siTelegram,
  siThreads,
  siTiktok,
  siUbuntu,
  siVivaldi,
  siWhatsapp,
  siX,
  siYcombinator,
  siYoutube
} from 'simple-icons';

export interface BrandGlyph {
  title: string;
  /** SVG path on a 24×24 grid. */
  path: string;
  /** Brand color without '#'. */
  hex: string;
}

export type ResolvedIcon =
  | { kind: 'glyph'; glyph: BrandGlyph }
  | { kind: 'device'; device: 'desktop' | 'mobile' | 'tablet' }
  | { kind: 'direct' }
  | { kind: 'unknown' }
  | { kind: 'favicon'; domain: string }
  | { kind: 'letter'; letter: string; hue: number };

// Brands simple-icons doesn't carry (Microsoft's, LinkedIn, OpenAI and a few
// others asked to be removed) resolve to their site's favicon instead.
const WINDOWS: BrandGlyph = {
  title: 'Windows',
  hex: '0078D4',
  path: 'M0 3.45 9.75 2.1v9.45H0zm10.95-1.5L24 0v11.55H10.95zM0 12.6h9.75v9.45L0 20.7zm10.95 0H24V24l-13.05-1.8z'
};

interface Entry {
  glyph?: BrandGlyph;
  /** Favicon to use when there is no bundled glyph. */
  domain?: string;
}

const ENTRIES: Record<string, Entry> = {
  // Browsers
  chrome: { glyph: siGooglechrome },
  safari: { glyph: siSafari },
  firefox: { glyph: siFirefoxbrowser },
  edge: { domain: 'microsoft.com' },
  opera: { glyph: siOpera },
  brave: { glyph: siBrave },
  vivaldi: { glyph: siVivaldi },
  samsung: { domain: 'samsung.com' },
  // Operating systems
  macos: { glyph: siApple },
  ios: { glyph: siApple },
  ipados: { glyph: siApple },
  windows: { glyph: WINDOWS },
  android: { glyph: siAndroid },
  linux: { glyph: siLinux },
  ubuntu: { glyph: siUbuntu },
  chromeos: { glyph: siGooglechrome },
  // Referrers and sources
  google: { glyph: siGoogle },
  x: { glyph: siX },
  github: { glyph: siGithub },
  gitlab: { glyph: siGitlab },
  hackernews: { glyph: siYcombinator },
  reddit: { glyph: siReddit },
  linkedin: { domain: 'linkedin.com' },
  facebook: { glyph: siFacebook },
  instagram: { glyph: siInstagram },
  youtube: { glyph: siYoutube },
  tiktok: { glyph: siTiktok },
  threads: { glyph: siThreads },
  bluesky: { glyph: siBluesky },
  mastodon: { glyph: siMastodon },
  pinterest: { glyph: siPinterest },
  producthunt: { glyph: siProducthunt },
  indiehackers: { glyph: siIndiehackers },
  medium: { glyph: siMedium },
  devto: { glyph: siDevdotto },
  substack: { glyph: siSubstack },
  stackoverflow: { glyph: siStackoverflow },
  discord: { glyph: siDiscord },
  telegram: { glyph: siTelegram },
  whatsapp: { glyph: siWhatsapp },
  slack: { domain: 'slack.com' },
  duckduckgo: { glyph: siDuckduckgo },
  bing: { domain: 'bing.com' },
  baidu: { glyph: siBaidu },
  yandex: { domain: 'yandex.com' },
  chatgpt: { domain: 'chatgpt.com' },
  perplexity: { glyph: siPerplexity },
  claude: { glyph: siClaude },
  gemini: { glyph: siGooglegemini }
};

/** Names as SDKs and user-agent parsers report them. */
const NAME_ALIASES: Record<string, string> = {
  'google chrome': 'chrome',
  'mobile chrome': 'chrome',
  'chrome mobile': 'chrome',
  'chrome ios': 'chrome',
  chromium: 'chrome',
  'mobile safari': 'safari',
  'safari mobile': 'safari',
  'mobile firefox': 'firefox',
  'firefox mobile': 'firefox',
  'microsoft edge': 'edge',
  'opera gx': 'opera',
  'opera mini': 'opera',
  'samsung internet': 'samsung',
  'samsung browser': 'samsung',
  'mac os': 'macos',
  'mac os x': 'macos',
  'os x': 'macos',
  'chrome os': 'chromeos',
  'x (twitter)': 'x',
  twitter: 'x',
  'hacker news': 'hackernews',
  'y combinator': 'hackernews',
  'product hunt': 'producthunt',
  'indie hackers': 'indiehackers',
  'dev.to': 'devto',
  'stack overflow': 'stackoverflow',
  'google gemini': 'gemini',
  openai: 'chatgpt'
};

/** Referrer hosts, matched on the registrable part (subdomains included). */
const DOMAIN_ALIASES: Record<string, string> = {
  'google.com': 'google',
  'x.com': 'x',
  'twitter.com': 'x',
  't.co': 'x',
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'news.ycombinator.com': 'hackernews',
  'ycombinator.com': 'hackernews',
  'reddit.com': 'reddit',
  'linkedin.com': 'linkedin',
  'lnkd.in': 'linkedin',
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'instagram.com': 'instagram',
  'youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'tiktok.com': 'tiktok',
  'threads.net': 'threads',
  'bsky.app': 'bluesky',
  'pinterest.com': 'pinterest',
  'producthunt.com': 'producthunt',
  'indiehackers.com': 'indiehackers',
  'medium.com': 'medium',
  'dev.to': 'devto',
  'substack.com': 'substack',
  'stackoverflow.com': 'stackoverflow',
  'discord.com': 'discord',
  'discord.gg': 'discord',
  't.me': 'telegram',
  'slack.com': 'slack',
  'duckduckgo.com': 'duckduckgo',
  'bing.com': 'bing',
  'baidu.com': 'baidu',
  'yandex.ru': 'yandex',
  'yandex.com': 'yandex',
  'chatgpt.com': 'chatgpt',
  'chat.openai.com': 'chatgpt',
  'perplexity.ai': 'perplexity',
  'claude.ai': 'claude',
  'gemini.google.com': 'gemini'
};

/** Placeholders SDKs and parsers report when they can't tell. */
const UNKNOWN = new Set(['unknown', '(unknown)', 'other', '(other)', 'n/a', '']);

/** How analytics report visits with no referrer. */
const DIRECT = new Set(['direct', '(direct)', '(none)', 'none', 'direct / none']);

const DEVICES: Record<string, 'desktop' | 'mobile' | 'tablet'> = {
  desktop: 'desktop',
  computer: 'desktop',
  mobile: 'mobile',
  phone: 'mobile',
  smartphone: 'mobile',
  tablet: 'tablet'
};

/** Lowercased host without scheme, path, port or a leading "www.". */
export function hostFromLabel(value: string): string | null {
  let text = value.trim().toLowerCase();
  if (!text) return null;
  text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(text) ? text : null;
}

function domainKey(host: string): string | undefined {
  // Try the full host, then each parent: "uk.linkedin.com" → "linkedin.com".
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = DOMAIN_ALIASES[parts.slice(i).join('.')];
    if (key) return key;
  }
  // Google's country domains: google.co.uk, google.de …
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
  return undefined;
}

/** Initial-letter badge with a stable color per label. */
export function letterIcon(label: string): Extract<ResolvedIcon, { kind: 'letter' }> {
  const letter = (label.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { kind: 'letter', letter, hue: hash % 360 };
}

function fromKey(key: string): ResolvedIcon | null {
  const entry = ENTRIES[key];
  if (entry?.glyph) return { kind: 'glyph', glyph: entry.glyph };
  if (entry?.domain) return { kind: 'favicon', domain: entry.domain };
  return null;
}

/**
 * Picks the icon for a table row. `label` is what the row shows (a browser,
 * OS, device or source name); `domain` is the site it came from, when known.
 */
export function resolveIcon(label: string, domain?: string | null): ResolvedIcon {
  const host = hostFromLabel(domain ?? '') ?? hostFromLabel(label);
  if (host) {
    const key = domainKey(host);
    return (key && fromKey(key)) || { kind: 'favicon', domain: host };
  }

  const name = label.trim().toLowerCase();
  if (DIRECT.has(name)) return { kind: 'direct' };
  if (UNKNOWN.has(name)) return { kind: 'unknown' };
  const device = DEVICES[name];
  if (device) return { kind: 'device', device };
  const key = NAME_ALIASES[name] ?? name.replace(/[\s.]+/g, '');
  return fromKey(key) ?? letterIcon(label);
}

/** True for colors too dark to read on a dark background (X, Apple, GitHub …). */
export function isDarkHex(hex: string): boolean {
  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60;
}
