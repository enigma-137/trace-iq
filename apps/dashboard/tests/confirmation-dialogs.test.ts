import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const confirmationSurfaces = [
  'app/dashboard/replays/ReplayDeleteButton.tsx',
  'app/dashboard/settings/replay/ReplaySettingsPanel.tsx',
  'app/dashboard/funnels/FunnelForm.tsx',
  'app/dashboard/dashboards/DashboardsApp.tsx',
  'app/dashboard/webhooks/WebhookManager.tsx',
  'app/dashboard/alerts/AlertManager.tsx',
  'app/dashboard/flags/FlagManager.tsx'
];

describe('dashboard confirmation surfaces', () => {
  it.each(confirmationSurfaces)('%s uses DashboardDialog instead of native confirm', (relativePath) => {
    const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');

    expect(source).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
    expect(source).toContain('<DashboardDialog');
  });
});
