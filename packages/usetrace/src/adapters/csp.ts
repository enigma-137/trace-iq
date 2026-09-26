import fs from 'node:fs/promises';
import path from 'node:path';

export interface CspInspectionResult {
  cspDetected: boolean;
  cspAllowsTraceiq: boolean;
  filePath?: string;
  connectSrcDirective?: string;
  targetOrigin: string;
  issue?: string;
  recommendation?: string;
}

/**
 * Check if the given connect-src directive allows the target TraceIQ API origin.
 */
export function connectSrcAllowsOrigin(connectSrcContent: string, targetOrigin: string): boolean {
  const tokens = connectSrcContent
    .trim()
    .split(/\s+/)
    .map((t) => t.trim().replace(/^['"]|['"]$/g, ''));

  // If wildcard or global https scheme is allowed
  if (tokens.includes('*') || tokens.includes('https:') || tokens.includes('http:')) {
    return true;
  }

  let originHost: string;
  try {
    originHost = new URL(targetOrigin).hostname;
  } catch {
    originHost = targetOrigin.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  }

  for (const token of tokens) {
    if (token === targetOrigin) return true;
    if (token.startsWith('https://') || token.startsWith('http://')) {
      try {
        const tokenHost = new URL(token).hostname;
        if (tokenHost === originHost) return true;
        if (tokenHost.startsWith('*.') && originHost.endsWith(tokenHost.slice(2))) {
          return true;
        }
      } catch {
        // continue
      }
    } else {
      // Host without scheme
      if (token === originHost) return true;
      if (token.startsWith('*.') && originHost.endsWith(token.slice(2))) return true;
    }
  }

  return false;
}

/**
 * Inspect candidate files in the project for Content Security Policy definitions.
 */
export async function inspectProjectCsp(cwd: string, targetApiUrl = 'https://api.traceiq.run'): Promise<CspInspectionResult> {
  let targetOrigin: string;
  try {
    targetOrigin = new URL(targetApiUrl).origin;
  } catch {
    targetOrigin = 'https://api.traceiq.run';
  }

  const candidateFiles = [
    'next.config.ts',
    'next.config.js',
    'next.config.mjs',
    'next.config.cjs',
    'middleware.ts',
    'middleware.js',
    path.join('src', 'middleware.ts'),
    path.join('src', 'middleware.js'),
    path.join('src', 'headers.ts'),
    path.join('src', 'headers.js'),
    path.join('src', 'lib', 'headers.ts'),
    path.join('src', 'lib', 'security.ts'),
    'index.html',
    path.join('public', 'index.html'),
    path.join('src', 'app', 'layout.tsx'),
    path.join('app', 'layout.tsx'),
    path.join('src', 'pages', '_document.tsx'),
    path.join('pages', '_document.tsx')
  ];

  for (const relPath of candidateFiles) {
    const fullPath = path.join(cwd, relPath);
    try {
      const content = await fs.readFile(fullPath, 'utf8');

      // Check if file contains CSP or connect-src configuration
      const hasCspMention =
        content.includes('Content-Security-Policy') ||
        content.includes('content-security-policy') ||
        content.includes('connect-src');

      if (!hasCspMention) continue;

      // Extract connect-src directive (allowing single-quoted tokens like 'self', 'none')
      const connectSrcMatch = content.match(/connect-src\s+([^;"`\\}\r\n]+)/i);

      if (connectSrcMatch) {
        const rawDirective = connectSrcMatch[1].trim();
        const allows = connectSrcAllowsOrigin(rawDirective, targetOrigin);

        if (!allows) {
          const cleanRel = relPath.replace(/\\/g, '/');
          return {
            cspDetected: true,
            cspAllowsTraceiq: false,
            filePath: cleanRel,
            connectSrcDirective: rawDirective,
            targetOrigin,
            issue: `Content Security Policy in ${cleanRel} blocks ${targetOrigin}.`,
            recommendation: `Add ${targetOrigin} to your connect-src directive in ${cleanRel}.`
          };
        }

        return {
          cspDetected: true,
          cspAllowsTraceiq: true,
          filePath: relPath.replace(/\\/g, '/'),
          connectSrcDirective: rawDirective,
          targetOrigin
        };
      } else if (content.includes('Content-Security-Policy') || content.includes('content-security-policy')) {
        // CSP header present without explicit connect-src (falls back to default-src)
        const defaultSrcMatch = content.match(/default-src\s+([^;"`\\}\r\n]+)/i);
        if (defaultSrcMatch) {
          const rawDirective = defaultSrcMatch[1].trim();
          const allows = connectSrcAllowsOrigin(rawDirective, targetOrigin);
          if (!allows) {
            const cleanRel = relPath.replace(/\\/g, '/');
            return {
              cspDetected: true,
              cspAllowsTraceiq: false,
              filePath: cleanRel,
              connectSrcDirective: `default-src: ${rawDirective}`,
              targetOrigin,
              issue: `Content Security Policy in ${cleanRel} default-src blocks ${targetOrigin}.`,
              recommendation: `Add connect-src directive with ${targetOrigin} in ${cleanRel}.`
            };
          }
        }
      }
    } catch {
      // File not found or unreadable, continue
    }
  }

  // No blocking CSP found
  return {
    cspDetected: false,
    cspAllowsTraceiq: true,
    targetOrigin
  };
}

/**
 * Safely and deterministically apply the minimal additive change to allow TraceIQ in connect-src.
 */
export async function patchProjectCsp(
  cwd: string,
  targetApiUrl = 'https://api.traceiq.run',
  dryRun?: boolean
): Promise<{ modified: boolean; filePath?: string; diff?: string }> {
  const inspection = await inspectProjectCsp(cwd, targetApiUrl);
  if (!inspection.cspDetected || inspection.cspAllowsTraceiq || !inspection.filePath) {
    return { modified: false };
  }

  const fullPath = path.join(cwd, inspection.filePath);
  try {
    const content = await fs.readFile(fullPath, 'utf8');

    // Find the connect-src match
    const connectSrcRegex = /(connect-src\s+)([^;"`\\}\r\n]+)/i;
    const match = content.match(connectSrcRegex);

    if (match) {
      const [fullMatch, prefix, existingTokens] = match;
      if (!connectSrcAllowsOrigin(existingTokens, inspection.targetOrigin)) {
        const updatedTokens = `${existingTokens.trim()} ${inspection.targetOrigin}`;
        const updatedMatch = `${prefix}${updatedTokens}`;
        const updatedContent = content.replace(connectSrcRegex, updatedMatch);

        if (!dryRun) {
          await fs.writeFile(fullPath, updatedContent, 'utf8');
        }

        return {
          modified: true,
          filePath: inspection.filePath,
          diff: `- ${fullMatch}\n+ ${updatedMatch}`
        };
      }
    }
  } catch {
    // If automated patch fails, caller will fall back to manual instructions
  }

  return { modified: false, filePath: inspection.filePath };
}
