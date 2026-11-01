import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildErrorFixPrompt, redactSensitive, type ErrorFixPromptInput } from '../src/lib/error-fix-prompt';

const issue = (overrides: Partial<ErrorFixPromptInput> = {}): ErrorFixPromptInput => ({
  type: 'TypeError',
  message: "Cannot read properties of undefined (reading 'items')",
  occurrences: 412,
  users: 231,
  sessions: 380,
  firstSeen: '2026-10-20T08:15:00Z',
  lastSeen: '2026-11-01T09:30:00Z',
  firstRelease: '1.4.0',
  lastRelease: '1.5.2',
  stack: 'TypeError: Cannot read properties of undefined\n    at CartSummary (src/components/CartSummary.tsx:42:18)\n    at renderWithHooks (react-dom.js:1:1)',
  stackIsSourceMapped: true,
  sourceContext: {
    file: 'src/components/CartSummary.tsx',
    line: 42,
    lines: [
      { line: 40, code: 'export function CartSummary({ cart }) {' },
      { line: 41, code: '  // total' },
      { line: 42, code: '  const total = cart.items.length;' },
      { line: 43, code: '  return <p>{total}</p>;' }
    ]
  },
  pages: ['/checkout', '/cart'],
  browsers: ['Chrome 120', 'Safari 17'],
  issueUrl: 'https://traceiq.run/dashboard/errors?issue=iss_1',
  ...overrides
});

describe('buildErrorFixPrompt', () => {
  it('gives the assistant the error, how often it happens, and where it fails', () => {
    const prompt = buildErrorFixPrompt(issue());
    expect(prompt).toContain("TypeError: Cannot read properties of undefined (reading 'items')");
    expect(prompt).toContain('Seen 412 times by 231 users across 380 sessions, from 2026-10-20 to 2026-11-01.');
    expect(prompt).toContain('Releases: first seen in 1.4.0, latest in 1.5.2.');
    expect(prompt).toContain('Most often on: /checkout, /cart.');
    expect(prompt).toContain('STACK TRACE (mapped back to the original source)');
    expect(prompt).toContain('at CartSummary (src/components/CartSummary.tsx:42:18)');
  });

  it('marks the failing source line and keeps line numbers aligned', () => {
    const prompt = buildErrorFixPrompt(issue());
    expect(prompt).toContain('SOURCE AROUND THE FAILING LINE (src/components/CartSummary.tsx:42)');
    expect(prompt).toContain('> 42 |   const total = cart.items.length;');
    expect(prompt).toContain('  41 |   // total');
  });

  it('tells the assistant to explain the cause, fix it properly, and add a test', () => {
    const prompt = buildErrorFixPrompt(issue());
    expect(prompt).toContain('say in one or two sentences what the root cause is');
    expect(prompt).toContain('Do not hide it with an empty try/catch');
    expect(prompt).toContain('Add or update a test that fails without your fix');
    expect(prompt).toContain('TraceIQ issue: https://traceiq.run/dashboard/errors?issue=iss_1');
  });

  it('is honest when there is no stack, instead of pointing at one', () => {
    const prompt = buildErrorFixPrompt(issue({ stack: null, sourceContext: null }));
    expect(prompt).not.toContain('STACK TRACE');
    expect(prompt).toContain('There is no stack trace for this issue.');
  });

  it('says so when the stack is still minified', () => {
    const prompt = buildErrorFixPrompt(issue({ stackIsSourceMapped: false, sourceContext: null }));
    expect(prompt).toContain('STACK TRACE (file names may be minified)');
    expect(prompt).toContain('If the file names are minified, search for the error message');
  });

  it('flags a regression, since the last fix did not hold', () => {
    const prompt = buildErrorFixPrompt(issue({ regressedInRelease: '1.5.2' }));
    expect(prompt).toContain('came back in 1.5.2');
  });

  it('uses singular words and leaves out empty lists', () => {
    const prompt = buildErrorFixPrompt(issue({ occurrences: 1, users: 1, sessions: 1, pages: [], browsers: [], firstRelease: null, lastRelease: null, issueUrl: null }));
    expect(prompt).toContain('Seen 1 time by 1 user across 1 session');
    expect(prompt).not.toContain('Most often on');
    expect(prompt).not.toContain('Browsers:');
    expect(prompt).not.toContain('Releases:');
    expect(prompt).not.toContain('TraceIQ issue:');
  });

  it('keeps a huge stack and message to a size an assistant can use', () => {
    const stack = Array.from({ length: 200 }, (_, index) => `    at frame${index} (file.js:${index}:1)`).join('\n');
    const prompt = buildErrorFixPrompt(issue({ stack, message: 'x'.repeat(5000), sourceContext: null }));
    expect(prompt).toContain('at frame29 ');
    expect(prompt).not.toContain('at frame30 ');
    expect(prompt).toContain('… (170 more lines)');
    expect(prompt.length).toBeLessThan(5000);
  });
});

describe('redactSensitive', () => {
  it('removes email addresses, bearer tokens and secret-looking values', () => {
    expect(redactSensitive('Failed for jane.doe@nuwell.com')).toBe('Failed for [email]');
    expect(redactSensitive('Authorization: Bearer abc123.def456.ghi789')).toContain('Bearer [token]');
    expect(redactSensitive('GET /pay?token=s3cr3t-value&plan=pro')).toBe('GET /pay?token=[redacted]&plan=pro');
    expect(redactSensitive('{"password":"hunter2222","name":"x"}')).toContain('"password":"[redacted]"');
    expect(redactSensitive('write_key: trq_live_abcdef')).toContain('write_key: [redacted]');
  });

  it('leaves ordinary error text alone', () => {
    const text = "TypeError: Cannot read properties of undefined (reading 'items') at CartSummary (CartSummary.tsx:42:18)";
    expect(redactSensitive(text)).toBe(text);
  });

  it('is applied to the message, the stack and the source lines in the prompt', () => {
    const prompt = buildErrorFixPrompt(
      issue({
        message: 'Charge failed for jane@nuwell.com',
        stack: 'Error at pay (pay.ts:9:1) token=abcd1234',
        sourceContext: { file: 'pay.ts', line: 9, lines: [{ line: 9, code: 'const key = "api_key=sk_live_12345678";' }] }
      })
    );
    expect(prompt).not.toContain('jane@nuwell.com');
    expect(prompt).not.toContain('abcd1234');
    expect(prompt).not.toContain('sk_live_12345678');
    expect(prompt).toContain('[email]');
  });
});

describe('error view', () => {
  it('offers the prompt next to the existing Copy button', () => {
    const view = readFileSync(new URL('../src/app/dashboard/errors/ErrorTrackingClientView.tsx', import.meta.url), 'utf8');
    expect(view).toContain("from '@/lib/error-fix-prompt'");
    expect(view).toContain('Copy fix prompt');
  });

  it('uses a plain wand on the button, not the sparkles icon', () => {
    const view = readFileSync(new URL('../src/app/dashboard/errors/ErrorTrackingClientView.tsx', import.meta.url), 'utf8');
    const button = view.slice(view.indexOf('onClick={() => void copyFixPrompt()}'));
    const buttonMarkup = button.slice(0, button.indexOf('</button>'));
    expect(buttonMarkup).toContain('<Wand ');
    expect(buttonMarkup).not.toContain('Sparkles');
  });
});
