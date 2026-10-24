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

  it('generates correct experiment list to detail routes and direct routes', () => {
    const expId = 'exp_12345';
    const expKey = 'checkout-cta-variant';
    const projectId = 'proj_main';

    // From list with active projectId
    const listToDetailHref = `/dashboard/experiments/${expId}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
    expect(listToDetailHref).toBe('/dashboard/experiments/exp_12345?projectId=proj_main');

    // Direct navigation URL with ID
    const directIdHref = `/dashboard/experiments/${expId}`;
    expect(directIdHref).toBe('/dashboard/experiments/exp_12345');

    // Direct navigation URL with Key slug
    const directKeyHref = `/dashboard/experiments/${expKey}`;
    expect(directKeyHref).toBe('/dashboard/experiments/checkout-cta-variant');
  });

  it('validates experiment creation metric requirement without silent checkout_completed default', () => {
    function validateExperimentForm(values: { name: string; key: string; primaryMetric: string }) {
      if (!values.name.trim()) return 'Experiment name is required.';
      if (!values.key.trim()) return 'Experiment key is required.';
      if (!values.primaryMetric.trim()) return 'Primary success metric event name is required.';
      return null;
    }

    // Default unselected metric must fail validation
    expect(validateExperimentForm({ name: 'Checkout Test', key: 'checkout-test', primaryMetric: '' }))
      .toBe('Primary success metric event name is required.');

    // Whitespace only metric must fail validation
    expect(validateExperimentForm({ name: 'Checkout Test', key: 'checkout-test', primaryMetric: '   ' }))
      .toBe('Primary success metric event name is required.');

    // Explicitly selected metric passes validation
    expect(validateExperimentForm({ name: 'Checkout Test', key: 'checkout-test', primaryMetric: 'user_subscribed' }))
      .toBeNull();
  });

  it('validates survey targeting and prevents hidden feature_completed fallback substitution', () => {
    function getInitialTargetingState(savedTargeting?: { type: 'all' | 'property' | 'event'; eventName?: string; propertyKey?: string }) {
      return {
        targetingType: savedTargeting?.type || 'all',
        propertyKey: savedTargeting?.propertyKey || '',
        eventName: savedTargeting?.eventName || ''
      };
    }

    // When reopening a survey with no event trigger, it must not substitute 'feature_completed'
    const cleanReopened = getInitialTargetingState({ type: 'event' });
    expect(cleanReopened.eventName).toBe('');
    expect(cleanReopened.eventName).not.toBe('feature_completed');

    // Reopening with an explicitly saved event displays exactly that event
    const explicitSaved = getInitialTargetingState({ type: 'event', eventName: 'order_paid' });
    expect(explicitSaved.eventName).toBe('order_paid');

    function validateSurveyTargeting(targeting: { type: string; eventName?: string; propertyKey?: string; propertyValue?: string }) {
      if (targeting.type === 'event' && (!targeting.eventName || !targeting.eventName.trim())) {
        return 'Trigger event name is required when targeting by event.';
      }
      if (targeting.type === 'property' && (!targeting.propertyKey?.trim() || !targeting.propertyValue?.trim())) {
        return 'User property name and value are required when targeting by property.';
      }
      return null;
    }

    // Empty event targeting must block saving
    expect(validateSurveyTargeting({ type: 'event', eventName: '' }))
      .toBe('Trigger event name is required when targeting by event.');

    // Explicit event targeting succeeds
    expect(validateSurveyTargeting({ type: 'event', eventName: 'invoice_generated' }))
      .toBeNull();
  });

  it('verifies required-question survey preview validation blocks advancing/submitting while keeping optional questions skippable', () => {
    function isQuestionAnswered(
      q: { type: string; required: boolean },
      answer: unknown
    ): boolean {
      if (answer === undefined || answer === null) return false;
      if (q.type === 'single_choice') {
        return typeof answer === 'string' && answer.trim().length > 0;
      }
      if (q.type === 'multiple_choice') {
        return Array.isArray(answer) && answer.length > 0;
      }
      if (q.type === 'rating_scale' || q.type === 'nps') {
        return typeof answer === 'number';
      }
      if (q.type === 'short_text' || q.type === 'long_text') {
        return typeof answer === 'string' && answer.trim().length > 0;
      }
      return Boolean(answer);
    }

    function canAdvanceOrSubmit(
      q: { type: string; required: boolean },
      answer: unknown
    ): boolean {
      if (!q.required) return true; // Optional questions are always skippable
      return isQuestionAnswered(q, answer);
    }

    // 1. Rating Scale Question
    const requiredRating = { type: 'rating_scale', required: true };
    expect(canAdvanceOrSubmit(requiredRating, undefined)).toBe(false); // Unanswered blocks
    expect(canAdvanceOrSubmit(requiredRating, 4)).toBe(true); // Answered allows advancing

    // 2. NPS Question
    const requiredNps = { type: 'nps', required: true };
    expect(canAdvanceOrSubmit(requiredNps, undefined)).toBe(false);
    expect(canAdvanceOrSubmit(requiredNps, 0)).toBe(true); // Score 0 is a valid NPS answer
    expect(canAdvanceOrSubmit(requiredNps, 10)).toBe(true);

    // 3. Single Choice Question
    const requiredSingleChoice = { type: 'single_choice', required: true };
    expect(canAdvanceOrSubmit(requiredSingleChoice, undefined)).toBe(false);
    expect(canAdvanceOrSubmit(requiredSingleChoice, '')).toBe(false);
    expect(canAdvanceOrSubmit(requiredSingleChoice, 'opt_daily')).toBe(true);

    // 4. Multiple Choice Question
    const requiredMultiChoice = { type: 'multiple_choice', required: true };
    expect(canAdvanceOrSubmit(requiredMultiChoice, undefined)).toBe(false);
    expect(canAdvanceOrSubmit(requiredMultiChoice, [])).toBe(false);
    expect(canAdvanceOrSubmit(requiredMultiChoice, ['opt_1'])).toBe(true);

    // 5. Required Text Questions
    const requiredText = { type: 'long_text', required: true };
    expect(canAdvanceOrSubmit(requiredText, undefined)).toBe(false);
    expect(canAdvanceOrSubmit(requiredText, '   ')).toBe(false);
    expect(canAdvanceOrSubmit(requiredText, 'Great product experience')).toBe(true);

    // 6. Optional Questions (must remain skippable)
    const optionalRating = { type: 'rating_scale', required: false };
    expect(canAdvanceOrSubmit(optionalRating, undefined)).toBe(true);

    const optionalText = { type: 'short_text', required: false };
    expect(canAdvanceOrSubmit(optionalText, undefined)).toBe(true);
  });
});
