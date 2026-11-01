import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('landing alerts section', () => {
  it('sits between the signal path and Ask TraceIQ', () => {
    const page = read('../src/app/page.tsx');
    const signal = page.indexOf('<LandingSignalPath />');
    const alerts = page.indexOf('<LandingAlertsSection />');
    const ask = page.indexOf('<LandingAiSection />');
    expect(signal).toBeGreaterThan(-1);
    expect(alerts).toBeGreaterThan(signal);
    expect(ask).toBeGreaterThan(alerts);
  });

  it('only shows deliveries TraceIQ really makes: alerts by email and Slack webhook, the brief to Telegram and Slack', () => {
    const demo = read('../src/components/landing/LandingAlertsDemo.tsx');
    const [alertScene, briefScene] = demo.split('tab: "Daily brief"');
    expect(alertScene).toContain('channel: "Slack"');
    expect(alertScene).toContain('channel: "Email"');
    expect(alertScene).not.toContain('channel: "Telegram"');
    expect(briefScene).toContain('channel: "Telegram"');
    expect(briefScene).toContain('channel: "Slack"');
  });

  it('keeps motion off for people who ask for reduced motion', () => {
    const css = read('../src/components/landing/landing-ai-demos.module.css');
    const alertCss = css.slice(css.indexOf('Alerts + daily brief demo'));
    expect(alertCss).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*{[^@]*animation: draw/);
  });
});
