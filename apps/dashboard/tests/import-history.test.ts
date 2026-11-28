import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Import page', () => {
  const source = readFileSync(new URL('../src/app/dashboard/import/ImportPanel.tsx', import.meta.url), 'utf8');

  it('asks for 2FA through the shared step-up dialog and resends with a fresh token', () => {
    expect(source).toContain("import { retryAfterStepUp } from '@/lib/step-up';");
    expect(source).toMatch(/const send = async \(\) => \{\s*(\/\/.*\s*)?const token = await getToken\(\);/);
    expect(source).toContain('await retryAfterStepUp(await send(), send)');
  });

  it('records each file upload, sends its chunks under that record, and closes it', () => {
    expect(source).toContain("'/v1/dashboard/import/files'");
    expect(source).toContain('JSON.stringify({ projectId, format, events: chunk, importId })');
    expect(source).toMatch(/\/finish`/);
    expect(source).toContain("await finish(state.stopped ? 'cancelled' : 'completed');");
    expect(source).toContain("await finish('failed', message);");
  });

  it('lists file uploads and PostHog imports together', () => {
    expect(source).toContain('Recent imports');
    expect(source).toContain("if (job.source === 'file') return <FileJobRow job={job} />;");
    expect(source).not.toContain('PostHog imports</h2>');
  });

  it('does not let a file upload block a PostHog import', () => {
    expect(source).toContain("const active = jobs.some((job) => job.source === 'posthog' &&");
  });
});
