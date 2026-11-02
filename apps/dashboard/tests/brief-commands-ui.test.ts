import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Daily brief page', () => {
  const panel = readFileSync(new URL('../src/app/dashboard/alerts/DailyBriefPanel.tsx', import.meta.url), 'utf8');

  it('tells people about the period commands, not just /brief', () => {
    for (const command of ['/brief_daily', '/brief_weekly', '/brief_monthly', '/brief_alltime', '/stop']) {
      expect(panel).toContain(command);
    }
    expect(panel).toContain('choose daily, weekly, monthly or all time');
  });
});
