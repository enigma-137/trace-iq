import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AiSanitizerService } from './ai-sanitizer.service';
import { FunnelResults } from '../../funnels/funnels.service';
import { FunnelPromptData, FunnelPromptStepData } from '../prompts/funnel.prompt';
import { StoryPromptData } from '../prompts/story.prompt';
import { TodayStoryFacts } from '../../insights/insights.service';

interface CacheEntry {
  content: string;
  model: string;
  promptVersion: string;
  expiresAt: number;
}

@Injectable()
export class AiContextService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5 * 60 * 1000; // 5 minutes
  private readonly maxCacheSize = 500;

  constructor(private readonly sanitizer: AiSanitizerService) {}

  /**
   * Builds sanitized, structured fact payload for Funnel analysis.
   */
  buildFunnelData(results: FunnelResults): FunnelPromptData {
    const sanitizedName = this.sanitizer.sanitizeText(results.funnel.name);

    const steps: FunnelPromptStepData[] = results.steps.map((step, index) => {
      const rawLabel = step.label ?? step.eventName;
      const sanitizedLabel = this.sanitizer.sanitizeText(rawLabel);
      const conversionFromStartPct = (step.conversionFromStart * 100).toFixed(1);

      return {
        index,
        label: sanitizedLabel,
        count: step.count,
        conversionFromStartPct,
        droppedFromPrevious: step.droppedFromPrevious
      };
    });

    let worstDrop: FunnelPromptData['worstDrop'] = null;
    for (let i = 1; i < results.steps.length; i += 1) {
      const step = results.steps[i];
      if (step.droppedFromPrevious <= 0) continue;
      if (!worstDrop || step.droppedFromPrevious > worstDrop.dropCount) {
        const rawLabel = step.label ?? step.eventName;
        worstDrop = {
          index: i,
          label: this.sanitizer.sanitizeText(rawLabel),
          dropCount: step.droppedFromPrevious,
          dropRatePct: Math.round((1 - step.conversionFromPrevious) * 100)
        };
      }
    }

    return {
      funnelName: sanitizedName,
      days: results.days,
      steps,
      worstDrop
    };
  }

  /**
   * Builds sanitized, structured fact payload for Story generation.
   */
  buildStoryData(projectName: string, facts: TodayStoryFacts): StoryPromptData {
    const sanitizedProjectName = this.sanitizer.sanitizeText(projectName);
    const sanitizedTopEvent = facts.topEvent
      ? {
          name: this.sanitizer.sanitizeText(facts.topEvent.name),
          count: facts.topEvent.count
        }
      : null;

    const sanitizedTopCountry = facts.topCountry
      ? {
          name: this.sanitizer.sanitizeText(facts.topCountry.name),
          count: facts.topCountry.count,
          pct: facts.topCountry.pct
        }
      : null;

    const sanitizedTopDevice = facts.topDevice
      ? {
          name: this.sanitizer.sanitizeText(facts.topDevice.name),
          count: facts.topDevice.count
        }
      : null;

    return {
      projectName: sanitizedProjectName,
      eventsToday: facts.eventsToday,
      eventsYesterday: facts.eventsYesterday,
      deltaPct: facts.deltaPct,
      uniquesToday: facts.uniquesToday,
      topEvent: sanitizedTopEvent,
      topCountry: sanitizedTopCountry,
      topDevice: sanitizedTopDevice,
      activeNow: facts.activeNow
    };
  }

  /**
   * Computes a deterministic cache key for AI queries to prevent redundant provider calls.
   */
  computeCacheKey(projectId: string, capability: string, promptVersion: string, model: string, factsPayload: unknown): string {
    const serialized = JSON.stringify(factsPayload);
    const hash = createHash('sha256').update(`${projectId}:${capability}:${promptVersion}:${model}:${serialized}`).digest('hex');
    return `${projectId}:${capability}:${hash}`;
  }

  getCached(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry;
  }

  setCached(key: string, content: string, model: string, promptVersion: string): void {
    if (this.cache.size >= this.maxCacheSize) {
      // Evict oldest entries
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      content,
      model,
      promptVersion,
      expiresAt: Date.now() + this.ttlMs
    });
  }
}
