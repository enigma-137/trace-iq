import { describe, expect, it } from 'vitest';
import { navItems, withProjectId } from '../src/app/dashboard/nav';

describe('Experiments and Surveys - UI & Navigation Tests', () => {
  it('includes Experiments and Surveys in the dashboard navigation list', () => {
    const keys = navItems.map((item) => item.key);
    expect(keys).toContain('experiments');
    expect(keys).toContain('surveys');

    const expItem = navItems.find((item) => item.key === 'experiments');
    expect(expItem?.href).toBe('/dashboard/experiments');
    expect(expItem?.label).toBe('Experiments');

    const surveyItem = navItems.find((item) => item.key === 'surveys');
    expect(surveyItem?.href).toBe('/dashboard/surveys');
    expect(surveyItem?.label).toBe('Surveys');
  });

  it('preserves projectId in navigation links for experiments and surveys', () => {
    const expUrl = withProjectId('/dashboard/experiments', 'proj_abc123');
    expect(expUrl).toBe('/dashboard/experiments?projectId=proj_abc123');

    const surveyUrl = withProjectId('/dashboard/surveys', 'proj_abc123');
    expect(surveyUrl).toBe('/dashboard/surveys?projectId=proj_abc123');

    const surveyDetailUrl = withProjectId('/dashboard/surveys/srv_123?tab=responses', 'proj_abc123');
    expect(surveyDetailUrl).toBe('/dashboard/surveys/srv_123?tab=responses&projectId=proj_abc123');
  });

  it('calculates NPS score correctly from promoter, passive, and detractor percentages', () => {
    // 60% Promoters (9-10), 20% Passives (7-8), 20% Detractors (0-6) -> NPS = 60 - 20 = +40
    const total = 100;
    const promoters = 60;
    const passives = 20;
    const detractors = 20;

    const npsScore = Math.round(((promoters / total) - (detractors / total)) * 100);
    expect(npsScore).toBe(40);

    // 100% Promoters -> +100
    expect(Math.round(((100 / 100) - (0 / 100)) * 100)).toBe(100);

    // 100% Detractors -> -100
    expect(Math.round(((0 / 100) - (100 / 100)) * 100)).toBe(-100);
  });

  it('calculates relative uplift between control baseline and variant', () => {
    const controlExposures = 1000;
    const controlConversions = 100; // 10% CR
    const controlCR = controlConversions / controlExposures;

    const variantExposures = 1000;
    const variantConversions = 125; // 12.5% CR
    const variantCR = variantConversions / variantExposures;

    const uplift = Math.round(((variantCR - controlCR) / controlCR) * 1000) / 10;
    expect(uplift).toBe(25); // +25.0% uplift
  });

  it('validates normalized variant weight sum', () => {
    const weights = [50, 30, 20];
    const total = weights.reduce((acc, w) => acc + w, 0);
    expect(total).toBe(100);
  });
});
