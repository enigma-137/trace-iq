import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_LANGUAGES } from '../src/app/docs/ai-prompt';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Python request timing docs', () => {
  const content = read('../src/app/docs/content.tsx');

  it('documents the Django, WSGI and ASGI middleware on the API performance page', () => {
    expect(content).toContain('traceiq.middleware.DjangoMiddleware');
    expect(content).toContain('WSGIMiddleware(app.wsgi_app, traceiq)');
    expect(content).toContain('app.add_middleware(ASGIMiddleware, client=traceiq)');
    expect(content).toContain('TRACEIQ_CLIENT');
  });

  it('tells people to return the same user id their frontend identifies', () => {
    expect(content).toContain('same id your frontend passes to');
  });

  it('is offered to coding assistants through the Python prompt data', () => {
    const python = AI_LANGUAGES.find((language) => language.id === 'python')!;
    expect(python.steps.join(' ')).toContain('traceiq.middleware');
    expect(python.featureSnippets?.['api-performance']).toContain('DjangoMiddleware');
    expect(python.featureSnippets?.['api-performance']).toContain('ASGIMiddleware');
  });

  it('matches what the Python package exports', () => {
    const source = readFileSync(new URL('../../../sdks/python/traceiq/middleware.py', import.meta.url), 'utf8');
    for (const name of ['DjangoMiddleware', 'WSGIMiddleware', 'ASGIMiddleware', 'get_trace_headers']) {
      expect(source).toContain(`class ${name}`.replace('class get_trace_headers', 'def get_trace_headers'));
    }
  });
});
