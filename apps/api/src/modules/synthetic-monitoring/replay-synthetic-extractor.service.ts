import { Injectable, Logger } from '@nestjs/common';
import {
  ReplaySyntheticDraft,
  ReplaySyntheticDraftStep,
  SelectorConfidence,
  SyntheticBrowser,
  SyntheticStep
} from '@traceiq/types';

interface SerializedNode {
  id: number;
  tagName?: string;
  type?: number;
  textContent?: string;
  attributes?: Record<string, string>;
  parentId?: number;
  childNodes?: SerializedNode[];
}

interface ExtractedSelector {
  selector: string;
  confidence: SelectorConfidence;
  strategy: string;
  needsReview: boolean;
}

const SENSITIVE_INPUT_REGEX =
  /(pass(word)?|passwd|card.?number|cc.?num|cvv|cvc|security.?code|secret|token|api.?key|access.?key|auth|pin|otp|2fa|mfa|ssn)/i;

const FRAMEWORK_GENERATED_ID_REGEX =
  /^(?:radix|react-aria|headlessui|chakra|nextui|aria|mui|css|downshift|combobox|popover|dialog)-[a-z0-9-_]+$|^[0-9a-f]{8}-[0-9a-f]{4}/i;

@Injectable()
export class ReplaySyntheticExtractorService {
  private readonly logger = new Logger(ReplaySyntheticExtractorService.name);
  private readonly maxStepsLimit = 100;

  /**
   * Deterministically extracts a synthetic monitor draft from a decoded replay event stream.
   */
  extractDraft(
    replayRecord: {
      id: string;
      sessionId: string;
      userId?: string | null;
      anonymousId?: string | null;
      startedAt: string;
      durationSeconds: number;
      deviceInfo?: any;
    },
    rawEvents: any[]
  ): ReplaySyntheticDraft {
    const warnings: string[] = [];
    let initialUrl = 'https://app.traceiq.dev';
    let baseOrigin = 'https://app.traceiq.dev';
    let viewportWidth = 1280;
    let viewportHeight = 720;
    let browserType: SyntheticBrowser = 'chromium';

    if (replayRecord.deviceInfo?.viewport) {
      viewportWidth = replayRecord.deviceInfo.viewport.width || 1280;
      viewportHeight = replayRecord.deviceInfo.viewport.height || 720;
    }

    const nodeMap = new Map<number, SerializedNode>();
    const extractedSteps: ReplaySyntheticDraftStep[] = [];
    const detectedDomains = new Set<string>();

    let lastClickTime = 0;
    let lastClickNodeId = -1;
    let currentInputBuffer: {
      nodeId: number;
      text: string;
      timestamp: number;
      node?: SerializedNode;
    } | null = null;
    let currentUrl = '';
    let hasAuthenticatedElements = false;

    // Helper to flush pending buffered input keystrokes into a single fill step
    const flushInputBuffer = () => {
      if (!currentInputBuffer) return;
      const { nodeId, text, timestamp } = currentInputBuffer;
      const node = nodeMap.get(nodeId);
      const selResult = this.deriveSelector(node, nodeMap);
      const isSensitive = this.isSensitiveInput(node, text);

      let finalValue = text;
      let isMasked = false;

      if (isSensitive) {
        isMasked = true;
        const tagType = node?.attributes?.type?.toLowerCase();
        const inputName = node?.attributes?.name?.toLowerCase() || '';

        if (tagType === 'password' || inputName.includes('pass')) {
          finalValue = '{{TEST_PASSWORD}}';
        } else if (tagType === 'email' || inputName.includes('email') || (/@/.test(text) && /\.[a-z]{2,}$/i.test(text.trim()))) {
          finalValue = '{{TEST_EMAIL}}';
        } else {
          finalValue = '{{SECRET_VALUE}}';
        }
      } else if (typeof text === 'string' && (text.includes('***') || text.includes('••••') || text.includes('*'))) {
        isMasked = true;
        finalValue = '{{SECRET_VALUE}}';
      }

      extractedSteps.push({
        type: 'fill',
        selector: selResult.selector,
        value: finalValue,
        description: `Fill ${node?.attributes?.name || node?.attributes?.placeholder || 'input'}`,
        sourceTimestamp: timestamp,
        relativeTimeMs: Math.max(0, timestamp - (rawEvents[0]?.timestamp || timestamp)),
        confidence: selResult.confidence,
        selectorStrategy: selResult.strategy,
        needsReview: selResult.needsReview || isMasked,
        isMasked,
        notes: isMasked ? 'Sensitive field detected. Replaced with secure placeholder.' : undefined
      });

      currentInputBuffer = null;
    };

    // Single linear pass through rrweb events
    for (const event of rawEvents) {
      if (!event || typeof event.type !== 'number') continue;

      const eventType = event.type;
      const timestamp = event.timestamp || 0;

      // 1. Meta Event (type 4): Initial URL and Dimensions
      if (eventType === 4 && event.data) {
        if (event.data.href && typeof event.data.href === 'string') {
          initialUrl = event.data.href;
          currentUrl = initialUrl;
          try {
            const parsed = new URL(initialUrl);
            baseOrigin = parsed.origin;
            detectedDomains.add(parsed.hostname);
          } catch {
            // URL parse fallback
          }
        }
        if (event.data.width) viewportWidth = Math.min(Math.max(event.data.width, 320), 3840);
        if (event.data.height) viewportHeight = Math.min(Math.max(event.data.height, 240), 2160);
      }

      // 2. Full Snapshot (type 2): Reconstruct DOM Mirror Tree
      else if (eventType === 2 && event.data?.node) {
        this.indexNodes(event.data.node, nodeMap);
      }

      // 3. Incremental Snapshot (type 3)
      else if (eventType === 3 && event.data) {
        const source = event.data.source;

        // 3a. DOM Mutations (source 0)
        if (source === 0) {
          if (Array.isArray(event.data.adds)) {
            for (const add of event.data.adds) {
              if (add.node) this.indexNodes(add.node, nodeMap, add.parentId);
            }
          }
          if (Array.isArray(event.data.attributes)) {
            for (const attrMut of event.data.attributes) {
              const existing = nodeMap.get(attrMut.id);
              if (existing && attrMut.attributes) {
                existing.attributes = { ...(existing.attributes || {}), ...attrMut.attributes };
              }
            }
          }
          if (Array.isArray(event.data.removes)) {
            for (const rem of event.data.removes) {
              nodeMap.delete(rem.id);
            }
          }
        }

        // 3b. Mouse Interaction (source 2)
        else if (source === 2) {
          const interactionType = event.data.type;
          const targetId = event.data.id;

          // Click interaction (type 2) or TouchEnd / MouseUp
          if (interactionType === 2 || interactionType === 0) {
            // Check debounce window (ignore duplicate rapid clicks on same element)
            if (targetId === lastClickNodeId && timestamp - lastClickTime < 400) {
              continue;
            }

            // Flush any active typed input before clicking
            flushInputBuffer();

            const targetNode = nodeMap.get(targetId);
            if (targetNode) {
              const selResult = this.deriveSelector(targetNode, nodeMap);
              const tagName = targetNode.tagName?.toLowerCase() || '';

              // Skip noise clicks on root html/body or empty spacers with no interactive role
              if (tagName === 'html' || (tagName === 'body' && !targetNode.attributes?.['data-testid'])) {
                continue;
              }

              lastClickTime = timestamp;
              lastClickNodeId = targetId;

              const buttonText = this.getNodeVisibleText(targetNode);
              const desc = buttonText
                ? `Click "${buttonText.slice(0, 30)}"`
                : `Click ${selResult.selector}`;

              extractedSteps.push({
                type: 'click',
                selector: selResult.selector,
                description: desc,
                sourceTimestamp: timestamp,
                relativeTimeMs: Math.max(0, timestamp - (rawEvents[0]?.timestamp || timestamp)),
                confidence: selResult.confidence,
                selectorStrategy: selResult.strategy,
                needsReview: selResult.needsReview
              });
            }
          }
        }

        // 3c. Text Input (source 5)
        else if (source === 5) {
          const targetId = event.data.id;
          const text = String(event.data.text ?? event.data.value ?? '');

          if (currentInputBuffer && currentInputBuffer.nodeId === targetId) {
            // Update buffered text with latest keystroke
            currentInputBuffer.text = text;
            currentInputBuffer.timestamp = timestamp;
          } else {
            // Target switched: flush previous input and start new buffer
            flushInputBuffer();
            currentInputBuffer = {
              nodeId: targetId,
              text,
              timestamp,
              node: nodeMap.get(targetId)
            };
          }
        }
      }

      // 4. Custom Event (type 5): Navigation / Route Change
      else if (eventType === 5 && event.data) {
        const tag = event.data.tag || event.data.type;
        const payload = event.data.payload || event.data;

        if (tag === 'navigate' || tag === 'route' || tag === 'location' || payload?.href) {
          flushInputBuffer();
          const targetHref = payload.href || payload.url || payload;
          if (typeof targetHref === 'string' && targetHref !== currentUrl) {
            currentUrl = targetHref;
            try {
              const parsed = new URL(targetHref);
              detectedDomains.add(parsed.hostname);

              const relativeUrl =
                parsed.origin === baseOrigin
                  ? parsed.pathname + parsed.search + parsed.hash
                  : targetHref;

              // Avoid duplicate consecutive navigations
              const lastStep = extractedSteps.at(-1);
              if (lastStep?.type !== 'navigate' || lastStep.url !== relativeUrl) {
                extractedSteps.push({
                  type: 'navigate',
                  url: relativeUrl || '/',
                  description: `Navigate to ${relativeUrl}`,
                  sourceTimestamp: timestamp,
                  relativeTimeMs: Math.max(0, timestamp - (rawEvents[0]?.timestamp || timestamp)),
                  confidence: 'high',
                  selectorStrategy: 'route-event'
                });
              }
            } catch {
              // Ignore invalid route string
            }
          }
        }
      }
    }

    // Flush any trailing input
    flushInputBuffer();

    // Ensure initial navigation step exists
    let initialPath = '/';
    try {
      const parsed = new URL(initialUrl);
      initialPath = parsed.pathname + parsed.search || '/';
    } catch {
      initialPath = '/';
    }

    const firstStep = extractedSteps[0];
    if (!firstStep || firstStep.type !== 'navigate' || firstStep.url !== initialPath) {
      extractedSteps.unshift({
        type: 'navigate',
        url: initialPath,
        description: `Open initial page (${initialPath})`,
        sourceTimestamp: rawEvents[0]?.timestamp || 0,
        relativeTimeMs: 0,
        confidence: 'high',
        selectorStrategy: 'initial-url'
      });
    }

    // Append automatic closing assertion on final state if safe
    const finalStep = extractedSteps.at(-1);
    if (finalStep && finalStep.type === 'click') {
      extractedSteps.push({
        type: 'assert_visible',
        selector: 'body',
        description: 'Verify page remains responsive after interaction',
        confidence: 'high',
        selectorStrategy: 'post-condition'
      });
    }

    // Step count capping
    let truncated = false;
    if (extractedSteps.length > this.maxStepsLimit) {
      extractedSteps.splice(this.maxStepsLimit);
      truncated = true;
      warnings.push(`Extracted journey was truncated to ${this.maxStepsLimit} steps to maintain optimal monitor performance.`);
    }

    // Cross-domain navigation warnings
    if (detectedDomains.size > 1) {
      const external = Array.from(detectedDomains).filter((d) => !baseOrigin.includes(d));
      if (external.length > 0) {
        warnings.push(
          `Cross-domain navigation detected (${external.join(', ')}). External third-party steps may require manual review or test tokens.`
        );
      }
    }

    // Authenticated session detection
    if (replayRecord.userId || hasAuthenticatedElements) {
      warnings.push(
        'This replay was captured from an identified user session. Synthetic monitors run in clean, unauthenticated browser contexts — ensure test credentials or public paths are configured.'
      );
    }

    // Stats
    const highConfidenceCount = extractedSteps.filter((s) => s.confidence === 'high').length;
    const lowConfidenceCount = extractedSteps.filter((s) => s.confidence === 'low' || s.needsReview).length;

    if (lowConfidenceCount > 0) {
      warnings.push(`${lowConfidenceCount} step(s) have low-confidence selectors that should be verified before activating this monitor.`);
    }

    const sessionDurationFmt =
      replayRecord.durationSeconds > 60
        ? `${Math.floor(replayRecord.durationSeconds / 60)}m ${Math.round(replayRecord.durationSeconds % 60)}s`
        : `${Math.round(replayRecord.durationSeconds)}s`;

    return {
      source: {
        type: 'replay',
        replayId: replayRecord.id,
        sessionId: replayRecord.sessionId,
        userId: replayRecord.userId,
        anonymousId: replayRecord.anonymousId,
        startedAt: replayRecord.startedAt,
        durationSeconds: replayRecord.durationSeconds,
        initialUrl,
        deviceInfo: {
          browser: replayRecord.deviceInfo?.browser || 'Chrome',
          os: replayRecord.deviceInfo?.os || 'Desktop',
          deviceType: replayRecord.deviceInfo?.deviceType || 'desktop',
          viewport: { width: viewportWidth, height: viewportHeight }
        }
      },
      monitor: {
        name: `Replay Flow: ${this.formatMonitorName(initialUrl, sessionDurationFmt)}`,
        baseUrl: baseOrigin,
        schedule: '15m',
        browser: browserType,
        viewportWidth,
        viewportHeight
      },
      initialSteps: extractedSteps,
      stats: {
        totalRawEvents: rawEvents.length,
        extractedStepsCount: extractedSteps.length,
        highConfidenceCount,
        lowConfidenceCount,
        truncated
      },
      warnings
    };
  }

  /**
   * Recursively indexes nodes from rrweb snapshots into a lookup map.
   */
  private indexNodes(node: SerializedNode, map: Map<number, SerializedNode>, parentId?: number) {
    if (!node || typeof node.id !== 'number') return;
    node.parentId = parentId;
    map.set(node.id, node);

    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        this.indexNodes(child, map, node.id);
      }
    }
  }

  /**
   * Derives a stable Playwright CSS or test attribute selector for a DOM node.
   */
  deriveSelector(node: SerializedNode | undefined, nodeMap: Map<number, SerializedNode>): ExtractedSelector {
    if (!node) {
      return {
        selector: 'body',
        confidence: 'low',
        strategy: 'fallback',
        needsReview: true
      };
    }

    const attrs = node.attributes || {};
    const tag = (node.tagName || 'div').toLowerCase();

    // Tier 1: Test ID attributes (Highest Confidence)
    const testId = attrs['data-testid'] || attrs['data-test'] || attrs['data-cy'] || attrs['data-qa'];
    if (testId) {
      const attrName = attrs['data-testid']
        ? 'data-testid'
        : attrs['data-test']
        ? 'data-test'
        : attrs['data-cy']
        ? 'data-cy'
        : 'data-qa';
      return {
        selector: `[${attrName}="${this.escapeAttribute(testId)}"]`,
        confidence: 'high',
        strategy: attrName,
        needsReview: false
      };
    }

    // Tier 2: Stable Element ID
    if (attrs.id && typeof attrs.id === 'string') {
      const rawId = attrs.id.trim();
      if (rawId && !FRAMEWORK_GENERATED_ID_REGEX.test(rawId) && !/\d{5,}/.test(rawId)) {
        return {
          selector: `#${this.escapeAttribute(rawId)}`,
          confidence: 'high',
          strategy: 'id',
          needsReview: false
        };
      }
    }

    // Tier 3: Form Element Name
    if (attrs.name && typeof attrs.name === 'string') {
      const name = attrs.name.trim();
      if (name) {
        return {
          selector: `${tag}[name="${this.escapeAttribute(name)}"]`,
          confidence: 'high',
          strategy: 'name',
          needsReview: false
        };
      }
    }

    // Tier 4: Accessible text on clickable button/link
    const visibleText = this.getNodeVisibleText(node);
    if ((tag === 'button' || tag === 'a') && visibleText && visibleText.length <= 32) {
      return {
        selector: `${tag}:has-text("${this.escapeAttribute(visibleText)}")`,
        confidence: 'medium',
        strategy: 'text-match',
        needsReview: false
      };
    }

    // Tier 5: Input Type / Placeholder / ARIA label
    if (attrs['aria-label']) {
      return {
        selector: `[aria-label="${this.escapeAttribute(attrs['aria-label'])}"]`,
        confidence: 'medium',
        strategy: 'aria-label',
        needsReview: false
      };
    }

    if (attrs.placeholder) {
      return {
        selector: `${tag}[placeholder="${this.escapeAttribute(attrs.placeholder)}"]`,
        confidence: 'medium',
        strategy: 'placeholder',
        needsReview: false
      };
    }

    if (attrs.role) {
      return {
        selector: `[role="${this.escapeAttribute(attrs.role)}"]`,
        confidence: 'medium',
        strategy: 'role',
        needsReview: false
      };
    }

    // Tier 6: Semantic CSS class combinations (avoiding auto-generated single classes)
    if (attrs.class && typeof attrs.class === 'string') {
      const classes = attrs.class
        .split(/\s+/)
        .filter((c) => c && !c.startsWith('_') && !c.includes(':') && !FRAMEWORK_GENERATED_ID_REGEX.test(c) && c.length < 30)
        .slice(0, 2);

      if (classes.length > 0) {
        return {
          selector: `${tag}.${classes.join('.')}`,
          confidence: 'medium',
          strategy: 'css-class',
          needsReview: false
        };
      }
    }

    // Tier 7: Structural Ancestor Path Fallback
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent) {
        const parentTag = (parent.tagName || 'div').toLowerCase();
        const parentId = parent.attributes?.id;
        if (parentId && !FRAMEWORK_GENERATED_ID_REGEX.test(parentId)) {
          return {
            selector: `#${this.escapeAttribute(parentId)} > ${tag}`,
            confidence: 'medium',
            strategy: 'parent-id',
            needsReview: false
          };
        }
        return {
          selector: `${parentTag} > ${tag}`,
          confidence: 'low',
          strategy: 'parent-tag',
          needsReview: true
        };
      }
    }

    return {
      selector: tag,
      confidence: 'low',
      strategy: 'tag-only',
      needsReview: true
    };
  }

  /**
   * Checks if an input element represents sensitive data.
   */
  private isSensitiveInput(node?: SerializedNode, textValue = ''): boolean {
    if (!node) return false;
    const attrs = node.attributes || {};
    const type = (attrs.type || '').toLowerCase();
    const name = (attrs.name || '').toLowerCase();
    const autocomplete = (attrs.autocomplete || '').toLowerCase();
    const id = (attrs.id || '').toLowerCase();
    const placeholder = (attrs.placeholder || '').toLowerCase();

    if (type === 'password' || type === 'email') return true;
    if (autocomplete === 'cc-number' || autocomplete === 'cc-csc' || autocomplete === 'one-time-code' || autocomplete === 'email') return true;
    if (name.includes('email') || id.includes('email') || placeholder.includes('email')) return true;
    if (SENSITIVE_INPUT_REGEX.test(name) || SENSITIVE_INPUT_REGEX.test(id) || SENSITIVE_INPUT_REGEX.test(placeholder)) {
      return true;
    }
    if (attrs['data-traceiq-mask'] || attrs['data-traceiq-block']) {
      return true;
    }
    if (typeof textValue === 'string' && /@/.test(textValue) && /\.[a-z]{2,}$/i.test(textValue.trim())) {
      return true;
    }
    return false;
  }

  /**
   * Extracts clean visible text from a node or its immediate text children.
   */
  private getNodeVisibleText(node: SerializedNode): string {
    if (node.textContent) {
      return node.textContent.trim().replace(/\s+/g, ' ');
    }
    if (Array.isArray(node.childNodes)) {
      for (const child of node.childNodes) {
        if (child.textContent) {
          const t = child.textContent.trim().replace(/\s+/g, ' ');
          if (t) return t;
        }
      }
    }
    return '';
  }

  private escapeAttribute(value: string): string {
    return value.replace(/"/g, '\\"').replace(/\n/g, '').trim();
  }

  private formatMonitorName(url: string, durationStr: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname === '/' ? 'Home' : parsed.pathname.replace(/^\//, '').replace(/\//g, ' › ');
      return `${path} (${durationStr})`;
    } catch {
      return `Session Journey (${durationStr})`;
    }
  }
}
