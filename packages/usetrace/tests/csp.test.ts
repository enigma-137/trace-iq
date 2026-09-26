import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { connectSrcAllowsOrigin, inspectProjectCsp, patchProjectCsp } from '../src/adapters/csp.js';
import { NextJsAdapter } from '../src/adapters/nextjs.adapter.js';

describe('Content Security Policy (CSP) Detector and Patcher', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'traceiq-csp-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('correctly evaluates connect-src tokens', () => {
    expect(connectSrcAllowsOrigin("'self' https://api.traceiq.run", 'https://api.traceiq.run')).toBe(true);
    expect(connectSrcAllowsOrigin("'self' https://*.traceiq.run", 'https://api.traceiq.run')).toBe(true);
    expect(connectSrcAllowsOrigin("'self' *", 'https://api.traceiq.run')).toBe(true);
    expect(connectSrcAllowsOrigin("'self' https:", 'https://api.traceiq.run')).toBe(true);
    expect(connectSrcAllowsOrigin("'self' https://api.supabase.co https://api.resend.com", 'https://api.traceiq.run')).toBe(false);
  });

  it('detects missing TraceIQ origin in Next.js next.config.ts CSP', async () => {
    const nextConfigContent = `
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; connect-src 'self' https://*.supabase.co https://api.resend.com;"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
`;
    await fs.writeFile(path.join(tmpDir, 'next.config.ts'), nextConfigContent, 'utf8');

    const inspection = await inspectProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(inspection.cspDetected).toBe(true);
    expect(inspection.cspAllowsTraceiq).toBe(false);
    expect(inspection.filePath).toBe('next.config.ts');
    expect(inspection.issue).toContain('Content Security Policy in next.config.ts blocks https://api.traceiq.run');
    expect(inspection.recommendation).toContain('Add https://api.traceiq.run to your connect-src directive');
  });

  it('detects permitted TraceIQ origin in Next.js next.config.ts', async () => {
    const nextConfigContent = `
const nextConfig = {
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "connect-src 'self' https://api.traceiq.run https://*.supabase.co"
        }
      ]
    }
  ]
};
module.exports = nextConfig;
`;
    await fs.writeFile(path.join(tmpDir, 'next.config.js'), nextConfigContent, 'utf8');

    const inspection = await inspectProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(inspection.cspDetected).toBe(true);
    expect(inspection.cspAllowsTraceiq).toBe(true);
    expect(inspection.filePath).toBe('next.config.js');
  });

  it('safely and deterministically patches next.config.ts with connect-src', async () => {
    const nextConfigContent = `
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "connect-src 'self' https://*.supabase.co https://api.resend.com"
        }
      ]
    }
  ]
};
export default nextConfig;
`;
    await fs.writeFile(path.join(tmpDir, 'next.config.ts'), nextConfigContent, 'utf8');

    const patchResult = await patchProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(patchResult.modified).toBe(true);
    expect(patchResult.filePath).toBe('next.config.ts');

    const updatedContent = await fs.readFile(path.join(tmpDir, 'next.config.ts'), 'utf8');
    expect(updatedContent).toContain("connect-src 'self' https://*.supabase.co https://api.resend.com https://api.traceiq.run");

    // Second run should be a no-op
    const secondPatch = await patchProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(secondPatch.modified).toBe(false);
  });

  it('integrates with NextJsAdapter inspect and install', async () => {
    await fs.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'my-next-app', dependencies: { next: '^14.0.0' } }, null, 2),
      'utf8'
    );
    await fs.mkdir(path.join(tmpDir, 'app'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'app', 'layout.tsx'), 'export default function Root({children}) { return <html><body>{children}</body></html>; }', 'utf8');

    const nextConfigContent = `
const nextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "connect-src 'self' https://api.supabase.co"
        }
      ]
    }
  ]
};
export default nextConfig;
`;
    await fs.writeFile(path.join(tmpDir, 'next.config.mjs'), nextConfigContent, 'utf8');

    const adapter = new NextJsAdapter();
    const state = await adapter.inspect(tmpDir);

    expect(state.cspDetected).toBe(true);
    expect(state.cspAllowsTraceiq).toBe(false);
    expect(state.cspFile).toBe('next.config.mjs');
    expect(state.issues.some((i) => i.includes('Content Security Policy'))).toBe(true);

    const patch = await patchProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(patch.modified).toBe(true);
    expect(patch.filePath).toBe('next.config.mjs');

    const stateAfter = await adapter.inspect(tmpDir);
    expect(stateAfter.cspAllowsTraceiq).toBe(true);
  });

  it('leaves dynamic template-interpolated CSP untouched and provides actionable advice', async () => {
    const dynamicNextConfig = `
const allowedOrigins = ['https://api.supabase.co', process.env.EXTRA_ORIGIN];
const nextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: \`default-src 'self'; connect-src 'self' \${allowedOrigins.join(' ')};\`,
        }
      ]
    }
  ]
};
export default nextConfig;
`;
    await fs.writeFile(path.join(tmpDir, 'next.config.mjs'), dynamicNextConfig, 'utf8');

    const inspection = await inspectProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(inspection.cspDetected).toBe(true);
    expect(inspection.cspAllowsTraceiq).toBe(false);
    expect(inspection.filePath).toBe('next.config.mjs');

    const patchResult = await patchProjectCsp(tmpDir, 'https://api.traceiq.run');
    // Safety check: dynamic template expression must NOT be modified
    expect(patchResult.modified).toBe(false);

    // File content must remain completely unmodified
    const contentAfter = await fs.readFile(path.join(tmpDir, 'next.config.mjs'), 'utf8');
    expect(contentAfter).toBe(dynamicNextConfig);
  });

  it('leaves multi-branch or ambiguous connect-src CSP untouched', async () => {
    const conditionalConfig = `
const isDev = process.env.NODE_ENV === 'development';
const nextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: isDev ? "connect-src 'self' http://localhost:8080" : "connect-src 'self' https://api.production.com",
        }
      ]
    }
  ]
};
module.exports = nextConfig;
`;
    await fs.writeFile(path.join(tmpDir, 'next.config.js'), conditionalConfig, 'utf8');

    const inspection = await inspectProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(inspection.cspDetected).toBe(true);
    expect(inspection.cspAllowsTraceiq).toBe(false);

    const patchResult = await patchProjectCsp(tmpDir, 'https://api.traceiq.run');
    // Safety check: multiple conditional directives must NOT be modified automatically
    expect(patchResult.modified).toBe(false);

    const contentAfter = await fs.readFile(path.join(tmpDir, 'next.config.js'), 'utf8');
    expect(contentAfter).toBe(conditionalConfig);
  });

  it('handles default-src only CSP safely without rewriting', async () => {
    const defaultSrcOnlyConfig = `
module.exports = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self' https://cdn.example.com;",
        }
      ]
    }
  ]
};
`;
    await fs.writeFile(path.join(tmpDir, 'next.config.js'), defaultSrcOnlyConfig, 'utf8');

    const inspection = await inspectProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(inspection.cspDetected).toBe(true);
    expect(inspection.cspAllowsTraceiq).toBe(false);
    expect(inspection.issue).toContain('default-src blocks https://api.traceiq.run');
    expect(inspection.recommendation).toContain('Add connect-src directive');

    const patchResult = await patchProjectCsp(tmpDir, 'https://api.traceiq.run');
    expect(patchResult.modified).toBe(false);

    const contentAfter = await fs.readFile(path.join(tmpDir, 'next.config.js'), 'utf8');
    expect(contentAfter).toBe(defaultSrcOnlyConfig);
  });
});
