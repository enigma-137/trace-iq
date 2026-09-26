import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const replaySettings = readFileSync(
  new URL('../src/app/dashboard/settings/replay/ReplaySettingsPanel.tsx', import.meta.url),
  'utf8'
);
const alerts = readFileSync(
  new URL('../src/app/dashboard/alerts/AlertManager.tsx', import.meta.url),
  'utf8'
);

describe('Cloud feature entitlement UI', () => {
  it('presents Replay as a Pro feature and requires explicit funnel selection', () => {
    expect(replaySettings).toContain('Session Replay is available on Pro.');
    expect(replaySettings).not.toContain('operator entitlement');
    expect(replaySettings).toContain('Flows to record');
    expect(replaySettings).toContain('selectedFunnelIds');
    expect(replaySettings).toContain('Zero selected flows never means record everything.');
    expect(replaySettings).toContain('Create a funnel');
  });

  it('accepts alertsAvailable entitlement prop in AlertManager', () => {
    expect(alerts).toContain('alertsAvailable');
  });
});
