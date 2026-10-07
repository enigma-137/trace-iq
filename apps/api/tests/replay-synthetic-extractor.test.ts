import { describe, expect, it } from 'vitest';
import { ReplaySyntheticExtractorService } from '../src/modules/synthetic-monitoring/replay-synthetic-extractor.service';

describe('ReplaySyntheticExtractorService', () => {
  const extractor = new ReplaySyntheticExtractorService();

  const mockReplay = {
    id: 'rpl_test_123',
    sessionId: 'ses_abc_456',
    userId: null,
    anonymousId: 'anon_789',
    startedAt: '2026-10-07T10:00:00.000Z',
    durationSeconds: 45,
    deviceInfo: {
      browser: 'Chrome',
      os: 'macOS',
      viewport: { width: 1440, height: 900 }
    }
  };

  it('extracts initial navigation and custom route navigations', () => {
    const events = [
      {
        type: 4, // Meta
        timestamp: 1000,
        data: { href: 'https://example.com/signup', width: 1440, height: 900 }
      },
      {
        type: 2, // FullSnapshot
        timestamp: 1005,
        data: {
          node: {
            id: 1,
            tagName: 'html',
            childNodes: [
              {
                id: 2,
                tagName: 'body',
                childNodes: [
                  { id: 3, tagName: 'div', attributes: { id: 'app' } }
                ]
              }
            ]
          }
        }
      },
      {
        type: 5, // Custom navigation event
        timestamp: 5000,
        data: { tag: 'navigate', payload: { href: 'https://example.com/dashboard' } }
      }
    ];

    const draft = extractor.extractDraft(mockReplay, events);

    expect(draft.source.replayId).toBe('rpl_test_123');
    expect(draft.source.sessionId).toBe('ses_abc_456');
    expect(draft.monitor.baseUrl).toBe('https://example.com');
    expect(draft.initialSteps.length).toBeGreaterThanOrEqual(2);
    expect(draft.initialSteps[0]).toMatchObject({
      type: 'navigate',
      url: '/signup',
      confidence: 'high'
    });
    expect(draft.initialSteps[1]).toMatchObject({
      type: 'navigate',
      url: '/dashboard',
      confidence: 'high'
    });
  });

  it('extracts click with high confidence using data-testid', () => {
    const events = [
      {
        type: 4,
        timestamp: 1000,
        data: { href: 'https://example.com/home', width: 1280, height: 720 }
      },
      {
        type: 2,
        timestamp: 1005,
        data: {
          node: {
            id: 1,
            tagName: 'html',
            childNodes: [
              {
                id: 2,
                tagName: 'body',
                childNodes: [
                  {
                    id: 10,
                    tagName: 'button',
                    attributes: { 'data-testid': 'submit-order-btn', class: 'btn primary' },
                    textContent: 'Place Order'
                  }
                ]
              }
            ]
          }
        }
      },
      {
        type: 3, // IncrementalSnapshot
        timestamp: 2500,
        data: {
          source: 2, // MouseInteraction
          type: 2, // Click
          id: 10
        }
      }
    ];

    const draft = extractor.extractDraft(mockReplay, events);
    const clickStep = draft.initialSteps.find((s) => s.type === 'click');

    expect(clickStep).toBeDefined();
    expect(clickStep?.selector).toBe('[data-testid="submit-order-btn"]');
    expect(clickStep?.confidence).toBe('high');
    expect(clickStep?.needsReview).toBeFalsy();
  });

  it('collapses multi-keystroke inputs into a single fill step', () => {
    const events = [
      {
        type: 4,
        timestamp: 1000,
        data: { href: 'https://example.com/login', width: 1280, height: 720 }
      },
      {
        type: 2,
        timestamp: 1005,
        data: {
          node: {
            id: 1,
            tagName: 'html',
            childNodes: [
              {
                id: 2,
                tagName: 'body',
                childNodes: [
                  {
                    id: 20,
                    tagName: 'input',
                    attributes: { name: 'username', type: 'text', placeholder: 'Enter username' }
                  }
                ]
              }
            ]
          }
        }
      },
      // Consecutive keystrokes on node 20
      { type: 3, timestamp: 2000, data: { source: 5, id: 20, text: 'a' } },
      { type: 3, timestamp: 2100, data: { source: 5, id: 20, text: 'al' } },
      { type: 3, timestamp: 2200, data: { source: 5, id: 20, text: 'ali' } },
      { type: 3, timestamp: 2300, data: { source: 5, id: 20, text: 'alice' } }
    ];

    const draft = extractor.extractDraft(mockReplay, events);
    const fillSteps = draft.initialSteps.filter((s) => s.type === 'fill');

    expect(fillSteps.length).toBe(1);
    expect(fillSteps[0].selector).toBe('input[name="username"]');
    expect(fillSteps[0].value).toBe('alice');
    expect(fillSteps[0].confidence).toBe('high');
  });

  it('preserves strict privacy by replacing passwords and sensitive fields with secure placeholders', () => {
    const events = [
      {
        type: 4,
        timestamp: 1000,
        data: { href: 'https://example.com/checkout', width: 1280, height: 720 }
      },
      {
        type: 2,
        timestamp: 1005,
        data: {
          node: {
            id: 1,
            tagName: 'html',
            childNodes: [
              {
                id: 2,
                tagName: 'body',
                childNodes: [
                  {
                    id: 30,
                    tagName: 'input',
                    attributes: { name: 'password', type: 'password' }
                  },
                  {
                    id: 31,
                    tagName: 'input',
                    attributes: { name: 'email', type: 'email' }
                  },
                  {
                    id: 32,
                    tagName: 'input',
                    attributes: { name: 'cardNumber', autocomplete: 'cc-number' }
                  }
                ]
              }
            ]
          }
        }
      },
      { type: 3, timestamp: 2000, data: { source: 5, id: 30, text: 'plaintext_super_secret_123!' } },
      { type: 3, timestamp: 3000, data: { source: 5, id: 31, text: 'realuser@acme.com' } },
      { type: 3, timestamp: 4000, data: { source: 5, id: 32, text: '4242424242424242' } }
    ];

    const draft = extractor.extractDraft(mockReplay, events);
    const fillSteps = draft.initialSteps.filter((s) => s.type === 'fill');

    expect(fillSteps.length).toBe(3);

    // Password replaced
    expect(fillSteps[0].value).toBe('{{TEST_PASSWORD}}');
    expect(fillSteps[0].value).not.toContain('super_secret');
    expect(fillSteps[0].isMasked).toBe(true);

    // Email replaced
    expect(fillSteps[1].value).toBe('{{TEST_EMAIL}}');
    expect(fillSteps[1].value).not.toContain('realuser@acme.com');
    expect(fillSteps[1].isMasked).toBe(true);

    // Card number replaced
    expect(fillSteps[2].value).toBe('{{SECRET_VALUE}}');
    expect(fillSteps[2].value).not.toContain('4242');
    expect(fillSteps[2].isMasked).toBe(true);
  });

  it('filters rrweb noise such as mouse movements, scroll events, and rapid click bouncing', () => {
    const events = [
      {
        type: 4,
        timestamp: 1000,
        data: { href: 'https://example.com/app', width: 1280, height: 720 }
      },
      {
        type: 2,
        timestamp: 1005,
        data: {
          node: {
            id: 1,
            tagName: 'html',
            childNodes: [
              {
                id: 2,
                tagName: 'body',
                childNodes: [
                  { id: 40, tagName: 'button', attributes: { id: 'save-btn' }, textContent: 'Save' }
                ]
              }
            ]
          }
        }
      },
      // Mouse move noise (source 1)
      { type: 3, timestamp: 1500, data: { source: 1, positions: [{ x: 10, y: 20 }] } },
      { type: 3, timestamp: 1550, data: { source: 1, positions: [{ x: 15, y: 25 }] } },
      // Scroll noise (source 3)
      { type: 3, timestamp: 1600, data: { source: 3, x: 0, y: 150 } },
      // First click
      { type: 3, timestamp: 2000, data: { source: 2, type: 2, id: 40 } },
      // Rapid bounce click on same target 50ms later (should be debounced)
      { type: 3, timestamp: 2050, data: { source: 2, type: 2, id: 40 } }
    ];

    const draft = extractor.extractDraft(mockReplay, events);
    const clickSteps = draft.initialSteps.filter((s) => s.type === 'click');

    expect(clickSteps.length).toBe(1);
    expect(clickSteps[0].selector).toBe('#save-btn');
  });

  it('flags low-confidence selectors that need manual review', () => {
    const events = [
      {
        type: 4,
        timestamp: 1000,
        data: { href: 'https://example.com/app', width: 1280, height: 720 }
      },
      {
        type: 2,
        timestamp: 1005,
        data: {
          node: {
            id: 1,
            tagName: 'html',
            childNodes: [
              // An anonymous span inside an anonymous div with no attributes
              {
                id: 50,
                tagName: 'div',
                childNodes: [
                  { id: 51, tagName: 'span' }
                ]
              }
            ]
          }
        }
      },
      { type: 3, timestamp: 2000, data: { source: 2, type: 2, id: 51 } }
    ];

    const draft = extractor.extractDraft(mockReplay, events);
    const clickStep = draft.initialSteps.find((s) => s.type === 'click');

    expect(clickStep).toBeDefined();
    expect(clickStep?.confidence).toBe('low');
    expect(clickStep?.needsReview).toBe(true);
    expect(draft.stats.lowConfidenceCount).toBeGreaterThanOrEqual(1);
    expect(draft.warnings.some((w) => w.includes('low-confidence'))).toBe(true);
  });

  it('respects maximum extracted step cap and generates truncation warnings', () => {
    const events: any[] = [
      { type: 4, timestamp: 1000, data: { href: 'https://example.com/long-flow', width: 1280, height: 720 } },
      {
        type: 2,
        timestamp: 1005,
        data: {
          node: {
            id: 1,
            tagName: 'html',
            childNodes: [
              {
                id: 2,
                tagName: 'body',
                childNodes: Array.from({ length: 150 }, (_, i) => ({
                  id: 100 + i,
                  tagName: 'button',
                  attributes: { 'data-testid': `btn-${i}` }
                }))
              }
            ]
          }
        }
      }
    ];

    // Generate 120 distinct clicks separated by 500ms
    for (let i = 0; i < 120; i++) {
      events.push({
        type: 3,
        timestamp: 2000 + i * 500,
        data: { source: 2, type: 2, id: 100 + i }
      });
    }

    const draft = extractor.extractDraft(mockReplay, events);

    expect(draft.initialSteps.length).toBeLessThanOrEqual(100);
    expect(draft.stats.truncated).toBe(true);
    expect(draft.warnings.some((w) => w.includes('truncated to 100 steps'))).toBe(true);
  });

  it('detects cross-domain navigations and raises warnings', () => {
    const events = [
      {
        type: 4,
        timestamp: 1000,
        data: { href: 'https://app.traceiq.dev/login', width: 1280, height: 720 }
      },
      {
        type: 2,
        timestamp: 1005,
        data: { node: { id: 1, tagName: 'html', childNodes: [{ id: 2, tagName: 'body' }] } }
      },
      {
        type: 5,
        timestamp: 3000,
        data: { tag: 'navigate', payload: { href: 'https://accounts.google.com/o/oauth2/auth' } }
      }
    ];

    const draft = extractor.extractDraft(mockReplay, events);

    expect(draft.warnings.some((w) => w.includes('Cross-domain navigation detected') && w.includes('accounts.google.com'))).toBe(true);
  });
});
