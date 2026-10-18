import { describe, expect, it } from 'vitest';
import {
  computeExceptionFingerprint,
  normalizeFile,
  normalizeMessage,
  parseStack,
  withExceptionFingerprint
} from '../src/modules/errors/fingerprint';

const v8Stack = (build: string, line: number, host = 'https://app.example.com') => `TypeError: Cannot read properties of undefined (reading 'id')
    at loadUser (${host}/_next/static/chunks/app/page-${build}.js:${line}:17)
    at async handleClick (${host}/_next/static/chunks/app/page-${build}.js:${line + 40}:5)
    at commitRoot (${host}/_next/static/chunks/node_modules/react-dom/cjs/react-dom.production.js:1:999)`;

describe('parseStack', () => {
  it('reads V8 frames with and without function names', () => {
    const frames = parseStack(`Error: boom
    at Object.handler (/srv/app/src/routes/users.ts:12:9)
    at /srv/app/src/server.ts:40:3
    at processTicksAndRejections (node:internal/process/task_queues:95:5)`);

    expect(frames).toEqual([
      { fn: 'Object.handler', file: '/srv/app/src/routes/users.ts', inApp: true },
      { fn: '?', file: '/srv/app/src/server.ts', inApp: true },
      { fn: 'processTicksAndRejections', file: 'node:internal/process/task_queues', inApp: false }
    ]);
  });

  it('reads Firefox/Safari frames', () => {
    const frames = parseStack(`loadUser@https://app.example.com/assets/index-BqT3x_9a.js:3:120
@https://app.example.com/assets/index-BqT3x_9a.js:9:4`);

    expect(frames.map((f) => [f.fn, f.file])).toEqual([
      ['loadUser', '/assets/index.js'],
      ['?', '/assets/index.js']
    ]);
  });

  it('reads Python tracebacks innermost first and marks site-packages as not in-app', () => {
    const frames = parseStack(`Traceback (most recent call last):
  File "/usr/lib/python3.12/site-packages/flask/app.py", line 880, in full_dispatch_request
  File "/srv/app/views.py", line 42, in checkout
ValueError: bad cart`);

    expect(frames[0]).toEqual({ fn: 'checkout', file: '/srv/app/views.py', inApp: true });
    expect(frames[1].inApp).toBe(false);
  });

  it('does not treat an email address in a message as a frame', () => {
    expect(parseStack('Error: invite for user@example.com failed')).toEqual([]);
  });
});

describe('normalizeFile', () => {
  it('drops origin, query string and bundle content hashes', () => {
    expect(normalizeFile('https://cdn.example.com/static/js/main.3f2a9c1b.js?v=2')).toBe('/static/js/main.js');
    expect(normalizeFile('webpack-internal:///(app-pages-browser)/./src/app/page.tsx')).toBe('./src/app/page.tsx');
    expect(normalizeFile('/srv/app/my-component.js')).toBe('/srv/app/my-component.js');
  });
});

describe('normalizeMessage', () => {
  it('replaces ids, numbers and quoted values', () => {
    expect(normalizeMessage('User 123 not found')).toBe(normalizeMessage('User 456 not found'));
    expect(normalizeMessage('Order 3fa85f64-5717-4562-b3fc-2c963f66afa6 failed')).toBe('Order <uuid> failed');
    expect(normalizeMessage("Unknown key 'theme'")).toBe('Unknown key <str>');
  });
});

describe('computeExceptionFingerprint', () => {
  it('groups the same error across deploys, hosts and line numbers', () => {
    const a = computeExceptionFingerprint({ type: 'TypeError', message: 'x', stack: v8Stack('8f3e2a1c9b0d4e5f', 10) });
    const b = computeExceptionFingerprint({
      type: 'TypeError',
      message: 'x',
      stack: v8Stack('1a2b3c4d5e6f7a8b', 250, 'http://localhost:3000')
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('keeps errors from different code apart even when the message matches', () => {
    const a = computeExceptionFingerprint({ type: 'Error', message: 'Network error', stack: 'Error\n    at fetchCart (/app/cart.ts:1:1)' });
    const b = computeExceptionFingerprint({ type: 'Error', message: 'Network error', stack: 'Error\n    at fetchUser (/app/user.ts:1:1)' });
    expect(a).not.toBe(b);
  });

  it('groups by stack even when the message embeds variable data', () => {
    const stack = 'Error\n    at findUser (/app/users.ts:3:3)';
    expect(computeExceptionFingerprint({ message: 'User 1 missing', stack })).toBe(
      computeExceptionFingerprint({ message: 'User 2 missing', stack })
    );
  });

  it('ignores minified function names, which change on every build', () => {
    const a = computeExceptionFingerprint({ stack: 'Error\n    at e (/assets/index-AAAA1111.js:1:100)' });
    const b = computeExceptionFingerprint({ stack: 'Error\n    at t (/assets/index-BBBB2222.js:1:900)' });
    expect(a).toBe(b);
  });

  it('falls back to type + normalized message without a stack', () => {
    expect(computeExceptionFingerprint({ type: 'Error', message: 'Timeout after 3000ms' })).toBe(
      computeExceptionFingerprint({ type: 'Error', message: 'Timeout after 5000ms' })
    );
    expect(computeExceptionFingerprint({ type: 'Error', message: 'a' })).not.toBe(
      computeExceptionFingerprint({ type: 'RangeError', message: 'a' })
    );
  });
});

describe('withExceptionFingerprint', () => {
  it('stamps $exception events and leaves others alone', () => {
    const props = { type: 'Error', message: 'boom' };
    expect(withExceptionFingerprint('$exception', props)).toMatchObject({ ...props, $fingerprint: expect.stringMatching(/^[0-9a-f]{32}$/) });
    expect(withExceptionFingerprint('$pageview', props)).toBe(props);
  });

  it('keeps a custom fingerprint sent by the SDK', () => {
    expect(withExceptionFingerprint('$exception', { message: 'x', $fingerprint: '  checkout-timeout ' })).toMatchObject({
      $fingerprint: 'checkout-timeout'
    });
  });
});
