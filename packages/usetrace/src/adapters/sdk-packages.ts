import path from 'node:path';

/**
 * The TraceIQ SDK packages the CLI installs, with the range it writes to package.json.
 * Keep in step with the published versions (packages/sdk-js and packages/node manifests);
 * tests/sdk-packages.test.ts fails when they drift apart.
 */
export const SDK_PACKAGES = {
  /** Browser SDK: Next.js, React, plain web apps. */
  browser: { name: 'traceiq-sdk-js', range: '^0.4.0' },
  /** Server SDK for Node.js 18+. */
  node: { name: 'traceiq-node', range: '^0.3.0' }
} as const;

/**
 * An import specifier from one file to another (`./x`, `../components/x`), without the
 * extension. Unlike an `@/` alias, it works in every project.
 */
export function relativeImport(fromFile: string, toFile: string): string {
  const target = toFile.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
  const relative = path.relative(path.dirname(fromFile), target).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}
