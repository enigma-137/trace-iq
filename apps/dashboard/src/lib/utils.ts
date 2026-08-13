import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a safe internal path for post-auth redirects, or null when the value
 * could point off-site (absolute URL, protocol-relative, or backslash tricks).
 * Prevents open-redirect via the `next` query parameter.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) {
    return fallback;
  }

  const candidate = value.trim();

  if (candidate.startsWith('//') || candidate.startsWith('\\')) {
    return fallback;
  }

  if (!candidate.startsWith('/')) {
    return fallback;
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    return fallback;
  }

  return candidate;
}
