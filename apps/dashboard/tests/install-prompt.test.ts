import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_LANGUAGES } from '../src/app/docs/ai-prompt';
import { INSTALL_STACKS, buildInstallPrompt, findInstallLanguage } from '../src/lib/install-prompt';
import type { AiLanguageId } from '../src/app/docs/ai-prompt';

const API = 'https://api.traceiq.run';

const prompt = (id: AiLanguageId, overrides: Partial<Parameters<typeof buildInstallPrompt>[0]> = {}) =>
  buildInstallPrompt({
    language: findInstallLanguage(id),
    projectId: 'proj_demo123',
    projectName: 'Nuwell AI Web',
    writeKey: 'trq_live_demoKey456',
    apiUrl: API,
    products: ['product-analytics', 'web-analytics', 'error-tracking', 'web-vitals'],
    ...overrides
  });

describe('install prompt', () => {
  it('holds the real project, key and endpoint, so the assistant has nothing to ask for', () => {
    const text = prompt('javascript');
    expect(text).toContain('Project ID: proj_demo123');
    expect(text).toContain('Write key: trq_live_demoKey456');
    expect(text).toContain(`API endpoint: ${API}`);
    expect(text).toContain('TraceIQ project: Nuwell AI Web');
  });

  it('tells the assistant to make the changes, not to stop and ask', () => {
    const text = prompt('javascript');
    expect(text).toContain('make the changes yourself');
    expect(text).toContain('ONLY STOP TO ASK IF YOU ARE BLOCKED');
    expect(text).not.toContain('ask me before generating');
  });

  it('does not invent a key when none exists yet', () => {
    const text = prompt('node', { writeKey: undefined });
    expect(text).toContain('Write key: not created yet');
    expect(text).toContain('Do not invent one');
    expect(text).not.toContain('trq_live_');
  });

  it('asks for verification, an honest report, and the deploy-time env vars', () => {
    const text = prompt('python');
    expect(text).toContain('Run the checks this project already has');
    expect(text).toContain('Setup Wizard is open and listening');
    expect(text).toContain('the environment variables I must also set where this app is deployed');
    expect(text).toContain('anything you did not do');
  });

  it('lists the features the person chose', () => {
    expect(prompt('node', { products: ['error-tracking', 'revenue-analytics'] })).toContain('Features I want: error tracking, revenue.');
    expect(prompt('node', { products: [] })).not.toContain('Features I want');
  });
});

describe('steps and notes', () => {
  it('numbers only its own steps, and keeps the docs notes as reference so they cannot contradict them', () => {
    const text = prompt('javascript');
    const numbered = text.split('\n').filter((line) => /^\d+\. /.test(line));
    expect(numbered.length).toBeGreaterThanOrEqual(6);
    expect(numbered.length).toBeLessThanOrEqual(9);
    expect(text).toContain('SDK NOTES (reference)');
    expect(text).toContain('- Identify users with `traceiq.identify({ userId, traits })` before tracking.');
  });

  it('does not repeat the install step as a note', () => {
    const text = prompt('javascript');
    expect(text.match(/Install the SDK/g)).toHaveLength(1); // the numbered step; the docs note is dropped
    expect(text).not.toContain('Create a project to get a project id');
  });

  it('shows the friendly stack name', () => {
    expect(prompt('javascript')).toContain('Chosen stack: Next.js / React / JS.');
    expect(prompt('python')).toContain('Chosen stack: Python.');
  });
});

describe('browser stack', () => {
  it('keeps initialization off the server and away from the layout parameter list', () => {
    const text = prompt('javascript');
    expect(text).toContain('nothing may touch `window` while the page renders on the server');
    expect(text).toContain('"use client"');
    expect(text).toContain("Never edit the layout function's parameter list");
  });

  it('uses the same env names the CLI writes, and offers Vite', () => {
    const text = prompt('javascript');
    expect(text).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID, NEXT_PUBLIC_TRACEIQ_WRITE_KEY, NEXT_PUBLIC_TRACEIQ_API_URL');
    expect(text).toContain('VITE_TRACEIQ_WRITE_KEY');
    expect(text).toContain('.env.local');
  });

  it('turns the SDK options on or off from the chosen products', () => {
    const all = prompt('javascript');
    expect(all).toContain('autoTrackPageViews: true');
    expect(all).toContain('autoCaptureExceptions: true');
    expect(all).toContain('autoCaptureWebVitals: true');

    const none = prompt('javascript', { products: ['funnels'] });
    expect(none).toContain('autoTrackPageViews: false');
    expect(none).toContain('autoCaptureExceptions: false');
    expect(none).toContain('autoCaptureWebVitals: false');
  });

  it('puts the endpoint into the reference code', () => {
    expect(prompt('javascript')).toContain(`endpoint: '${API}'`);
  });
});

describe('server stacks', () => {
  it('sets the endpoint explicitly, since the SDKs default to localhost', () => {
    for (const id of ['node', 'python', 'php', 'rust'] as const) {
      const text = prompt(id);
      expect(text).toContain(`TRACEIQ_ENDPOINT (${API})`);
      expect(text).toContain('TRACEIQ_WRITE_KEY');
    }
  });

  it('uses the language SDK install line', () => {
    expect(prompt('python')).toContain('pip install traceiq-py');
    expect(prompt('php')).toContain('composer require traceiq/traceiq-php');
    expect(prompt('node')).toContain('npm install traceiq-node');
  });

  it('warns to flush before a short-lived process exits', () => {
    expect(prompt('python')).toContain('before a short-lived process exits');
    expect(prompt('node')).toContain('shutdown()');
  });
});

describe('other stacks', () => {
  it('has no install step for the HTTP API', () => {
    const text = prompt('other');
    expect(text).toContain('There is no SDK for this language');
    expect(text).not.toContain('N/A');
    expect(text).toContain('/v1/events');
  });

  it('points mobile apps at their own configuration mechanism', () => {
    for (const id of ['react-native', 'flutter', 'swift', 'kotlin'] as const) {
      expect(prompt(id)).toContain("project's own configuration mechanism");
    }
  });
});

describe('stack chips', () => {
  it('every chip maps to a real language, never the silent fallback', () => {
    for (const stack of INSTALL_STACKS) {
      expect(AI_LANGUAGES.some((language) => language.id === stack.id)).toBe(true);
      expect(findInstallLanguage(stack.id).id).toBe(stack.id);
    }
  });

  it('leaves out the MCP server, which is not an app SDK', () => {
    expect(INSTALL_STACKS.some((stack) => stack.id === 'mcp')).toBe(false);
  });
});

describe('setup wizard', () => {
  const wizard = readFileSync(new URL('../src/app/dashboard/SetupWizard.tsx', import.meta.url), 'utf8');

  it('leads the install step with Install with AI, ahead of the CLI', () => {
    expect(wizard).toContain('<InstallWithAiCard');
    expect(wizard.indexOf('<InstallWithAiCard')).toBeLessThan(wizard.indexOf('Run useTrace in your project terminal'));
  });

  it('no longer calls the CLI the recommended path', () => {
    expect(wizard).not.toContain('Recommended · Automated Setup');
    expect(wizard).toContain('Or run the CLI');
  });
});
