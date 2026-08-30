import { Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import Groq from 'groq-sdk';
import { DashboardUser } from '../auth/auth.service';
import { FunnelResults, FunnelsService } from '../funnels/funnels.service';
import { appConfig } from '../../config/app.config';
import { DatabaseService } from '../../database/database.service';
import { EntitlementService } from '../billing/entitlement.service';
import { UsageService } from '../billing/usage.service';
import { ProjectsService } from '../projects/projects.service';

export const AI_MODEL = 'openai/gpt-oss-120b';

export interface AiSummary {
  summary: string;
  model: string;
  generatedAt: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: Groq | null | undefined;

  constructor(
    private readonly funnels: FunnelsService,
    @Optional() private readonly projects?: ProjectsService,
    @Optional() private readonly entitlements?: EntitlementService,
    @Optional() private readonly usage?: UsageService,
    @Optional() private readonly database?: DatabaseService
  ) { }

  async summarizeFunnelDropOff(
    user: DashboardUser,
    funnelId: string,
    daysParam: string | undefined,
    projectId: string | undefined
  ): Promise<AiSummary> {
    let organizationId: string | null = null;
    if (appConfig.deploymentMode === 'cloud') {
      if (!this.projects || !this.entitlements || !this.usage || !this.database) {
        throw new ServiceUnavailableException('Cloud AI entitlements are not configured.');
      }
      const project = await this.projects.requireActiveProject(user, projectId);
      organizationId = project.organizationId;
      await this.entitlements.assertAvailable(organizationId, 'aiInsights');
    }
    const results = await this.funnels.getResults(user, funnelId, daysParam, projectId);

    const insufficientData = results.steps.length < 2 || (results.steps[0]?.count ?? 0) < 5;
    if (insufficientData) {
      return {
        summary:
          "Not enough traffic through this funnel yet for a reliable explanation — come back once more people have started it.",
        model: 'none',
        generatedAt: new Date().toISOString()
      };
    }

    const prompt = this.buildFunnelPrompt(results);
    const summary = await this.complete(prompt);

    if (organizationId && this.database && this.usage) {
      await this.database.transaction((client) => this.usage!.consume(client, organizationId!, 'aiInsights', 1));
    }

    return { summary, model: AI_MODEL, generatedAt: new Date().toISOString() };
  }

  private buildFunnelPrompt(results: FunnelResults): string {
    const lines = results.steps.map((step, index) => {
      const label = step.label ?? step.eventName;
      const pctOfStart = (step.conversionFromStart * 100).toFixed(1);
      if (index === 0) {
        return `${index + 1}. "${label}" — ${step.count} people entered here.`;
      }
      return `${index + 1}. "${label}" — ${step.count} people (${pctOfStart}% of start), ${step.droppedFromPrevious} dropped off from the previous step.`;
    });

    const worst = this.biggestDrop(results);
    const worstLine = worst
      ? `Biggest drop-off: step ${worst.index + 1} ("${worst.label}") lost ${worst.dropCount} people (${worst.dropRate}% of those who reached the previous step).`
      : 'No single step stands out as the biggest drop-off.';

    return [
      `Funnel "${results.funnel.name}" over the last ${results.days} days:`,
      ...lines,
      worstLine,
      '',
      "Explain what's happening in 2-3 short sentences, using only the numbers above. If a step's drop-off is unusually large, call it out and suggest one concrete thing worth checking next (e.g. a specific step to investigate, without inventing causes you can't see in the data)."
    ].join('\n');
  }

  private biggestDrop(results: FunnelResults): { index: number; label: string; dropCount: number; dropRate: number } | null {
    let worst: { index: number; label: string; dropCount: number; dropRate: number } | null = null;
    for (let i = 1; i < results.steps.length; i += 1) {
      const step = results.steps[i];
      if (step.droppedFromPrevious <= 0) continue;
      if (!worst || step.droppedFromPrevious > worst.dropCount) {
        worst = {
          index: i,
          label: step.label ?? step.eventName,
          dropCount: step.droppedFromPrevious,
          dropRate: Math.round((1 - step.conversionFromPrevious) * 100)
        };
      }
    }
    return worst;
  }

  /**
   * Best-effort completion for non-critical surfaces (Today's Story). Unlike
   * {@link complete}, a missing GROQ_API_KEY or a failed call returns `null`
   * instead of throwing, so the caller can fall back to a template.
   */
  async completeSafely(userPrompt: string): Promise<string | null> {
    try {
      return await this.complete(userPrompt);
    } catch (error) {
      this.logger.warn('AI completion unavailable; caller will use its fallback.', error instanceof Error ? error.message : error);
      return null;
    }
  }

  private async complete(userPrompt: string): Promise<string> {
    const client = this.getClient();

    try {
      const completion = await client.chat.completions.create({
        model: AI_MODEL,
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          {
            role: 'system',
            content:
              'You are a product analytics assistant embedded in the TraceIQ dashboard. You explain funnel and event data concisely and factually, using only the numbers given to you. Never invent data that was not provided. Do not mention that you are an AI model.'
          },
          { role: 'user', content: userPrompt }
        ]
      });

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Groq returned an empty response.');
      }
      return content;
    } catch (error) {
      this.logger.error('Groq completion failed', error instanceof Error ? error.stack : error);
      throw new ServiceUnavailableException('AI summary is temporarily unavailable. Try again shortly.');
    }
  }

  private getClient(): Groq {
    if (this.client === undefined) {
      const apiKey = process.env.GROQ_API_KEY;
      this.client = apiKey ? new Groq({ apiKey }) : null;
    }

    if (!this.client) {
      throw new ServiceUnavailableException('AI summaries are not configured. Set GROQ_API_KEY on the API service.');
    }

    return this.client;
  }
}
