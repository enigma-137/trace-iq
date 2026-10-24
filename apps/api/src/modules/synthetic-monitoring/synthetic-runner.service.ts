import { Injectable, Logger } from '@nestjs/common';
import {
  SyntheticBrowser,
  SyntheticConsoleLog,
  SyntheticHttpError,
  SyntheticNetworkRequest,
  SyntheticRunStatus,
  SyntheticStep,
  SyntheticStepResult
} from '@traceiq/types';
import { SyntheticSsrfValidator } from './synthetic-ssrf-validator';
import { SyntheticCryptoService } from './synthetic-crypto.service';
import { SyntheticArtifactService } from './synthetic-artifact.service';

export interface ExecuteMonitorOptions {
  runId: string;
  projectId: string;
  baseUrl: string;
  browserType: SyntheticBrowser;
  viewportWidth: number;
  viewportHeight: number;
  timeoutMs: number;
  steps: SyntheticStep[];
  secrets?: Record<string, string>;
  allowLocal?: boolean;
}

export interface ExecutionResult {
  status: SyntheticRunStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  failedStepIndex: number | null;
  failureReason: string | null;
  finalUrl: string | null;
  stepResults: SyntheticStepResult[];
  consoleLogs: SyntheticConsoleLog[];
  networkRequests: SyntheticNetworkRequest[];
  httpErrors: SyntheticHttpError[];
  screenshotArtifactId: string | null;
  screenshotBase64: string | null;
}

@Injectable()
export class SyntheticRunnerService {
  private readonly logger = new Logger(SyntheticRunnerService.name);
  private activeExecutions = 0;
  private readonly maxGlobalConcurrent = 5;
  private readonly activePerTenant = new Map<string, number>();
  private readonly maxPerTenant = 2;

  constructor(
    private readonly crypto: SyntheticCryptoService = new SyntheticCryptoService(),
    private readonly artifacts?: SyntheticArtifactService
  ) {}

  private responseRequestId(res: any): string | null {
    try {
      const value = res.headers?.()?.['x-request-id'];
      return typeof value === 'string' && /^[A-Za-z0-9._:/+=-]{1,128}$/.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  async execute(options: ExecuteMonitorOptions): Promise<ExecutionResult> {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    const consoleLogs: SyntheticConsoleLog[] = [];
    const networkRequests: SyntheticNetworkRequest[] = [];
    const httpErrors: SyntheticHttpError[] = [];
    const stepResults: SyntheticStepResult[] = [];
    const secrets = options.secrets || {};
    const secretValues = Object.values(secrets).filter((v) => v && v.length >= 2);

    let failedStepIndex: number | null = null;
    let failureReason: string | null = null;
    let finalUrl: string | null = null;
    let screenshotArtifactId: string | null = null;
    let screenshotBase64: string | null = null;
    let status: SyntheticRunStatus = 'passed';

    // 1. Initial async SSRF validation (including DNS resolution) on base URL
    try {
      await SyntheticSsrfValidator.validateUrlAsync(options.baseUrl, { allowLocal: options.allowLocal });
    } catch (err: any) {
      return {
        status: 'failed',
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        failedStepIndex: 0,
        failureReason: this.crypto.redact(err.message || 'SSRF Validation Failed', secretValues),
        finalUrl: null,
        stepResults: [],
        consoleLogs: [],
        networkRequests: [],
        httpErrors: [],
        screenshotArtifactId: null,
        screenshotBase64: null
      };
    }

    // 2. Concurrency checks (Global and per-tenant)
    const tenantActive = this.activePerTenant.get(options.projectId) || 0;
    if (tenantActive >= this.maxPerTenant || this.activeExecutions >= this.maxGlobalConcurrent) {
      // Concurrency gate reached, wait briefly
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    this.activeExecutions++;
    this.activePerTenant.set(options.projectId, (this.activePerTenant.get(options.projectId) || 0) + 1);

    let browserInstance: any = null;
    let context: any = null;
    let page: any = null;

    try {
      let pw: any;
      try {
        pw = await import('playwright');
      } catch (err: any) {
        throw new Error(`Playwright runtime is not available: ${err.message}`);
      }

      const launcher =
        options.browserType === 'firefox'
          ? pw.firefox
          : options.browserType === 'webkit'
          ? pw.webkit
          : pw.chromium;

      browserInstance = await launcher.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-sync'
        ]
      });

      context = await browserInstance.newContext({
        viewport: {
          width: Math.min(Math.max(options.viewportWidth || 1280, 320), 3840),
          height: Math.min(Math.max(options.viewportHeight || 720, 240), 2160)
        },
        userAgent: 'TraceIQ-SyntheticMonitor/1.0 (+https://traceiq.dev)',
        ignoreHTTPSErrors: false
      });

      page = await context.newPage();
      const runTimeout = Math.min(options.timeoutMs || 30000, 60000);
      page.setDefaultTimeout(runTimeout);
      page.setDefaultNavigationTimeout(runTimeout);

      // 3. Playwright Route Interception for runtime SSRF & Redirect Protection
      await page.route('**', async (route: any, request: any) => {
        const reqUrl = request.url();
        try {
          // Validate every outgoing request, redirect, and subresource
          await SyntheticSsrfValidator.validateUrlAsync(reqUrl, { allowLocal: options.allowLocal });
          await route.continue();
        } catch (ssrfErr: any) {
          this.logger.warn(`SSRF attempt blocked in synthetic run ${options.runId} for URL: ${reqUrl}`);
          await route.abort('accessdenied');
        }
      });

      // Console listener (bounded to 50 entries, redacted)
      page.on('console', (msg: any) => {
        if (consoleLogs.length < 50) {
          const rawText = msg.text().slice(0, 500);
          consoleLogs.push({
            type: msg.type() as any,
            text: this.crypto.redact(rawText, secretValues),
            timestamp: new Date().toISOString()
          });
        }
      });

      // Network request listener (bounded to 100 entries, redacted)
      page.on('requestfailed', (req: any) => {
        if (networkRequests.length < 100) {
          const rawUrl = req.url().slice(0, 500);
          networkRequests.push({
            url: this.crypto.redact(rawUrl, secretValues),
            method: req.method(),
            failed: true,
            failureText: this.crypto.redact(req.failure()?.errorText || 'Network request failed', secretValues)
          });
        }
      });

      page.on('response', (res: any) => {
        const req = res.request();
        const statusCode = res.status();
        const rawUrl = req.url().slice(0, 500);
        const redactedUrl = this.crypto.redact(rawUrl, secretValues);
        // Instrumented backends echo their request id; recording it lets a run link
        // to the exact server-side request record. Read-only: nothing is injected.
        const requestId = this.responseRequestId(res);

        if (networkRequests.length < 100) {
          networkRequests.push({
            url: redactedUrl,
            method: req.method(),
            status: statusCode,
            failed: statusCode >= 400,
            ...(requestId ? { requestId } : {})
          });
        }

        if (statusCode >= 400 && httpErrors.length < 30) {
          httpErrors.push({
            url: redactedUrl,
            method: req.method(),
            status: statusCode,
            statusText: this.crypto.redact(res.statusText() || '', secretValues),
            ...(requestId ? { requestId } : {})
          });
        }
      });

      let currentBase = options.baseUrl;

      for (let idx = 0; idx < options.steps.length; idx++) {
        const rawStep = options.steps[idx];
        const stepStartTime = Date.now();
        const stepTimeout = Math.min(rawStep.timeoutMs || runTimeout, 60000);

        // Interpolate secrets into step fields
        const step: SyntheticStep = {
          ...rawStep,
          url: rawStep.url ? this.crypto.interpolate(rawStep.url, secrets) : undefined,
          selector: rawStep.selector ? this.crypto.interpolate(rawStep.selector, secrets) : undefined,
          value: rawStep.value ? this.crypto.interpolate(rawStep.value, secrets) : undefined,
          description: rawStep.description ? this.crypto.interpolate(rawStep.description, secrets) : undefined
        };

        try {
          switch (step.type) {
            case 'navigate': {
              let target = step.url || currentBase;
              if (target.startsWith('/')) {
                const baseObj = new URL(currentBase);
                target = `${baseObj.origin}${target}`;
              }
              await SyntheticSsrfValidator.validateUrlAsync(target, { allowLocal: options.allowLocal });
              await page.goto(target, {
                waitUntil: 'domcontentloaded',
                timeout: stepTimeout
              });
              currentBase = page.url();
              break;
            }

            case 'click': {
              if (!step.selector) throw new Error('Missing selector for click action');
              await page.click(step.selector, { timeout: stepTimeout });
              break;
            }

            case 'fill': {
              if (!step.selector) throw new Error('Missing selector for fill action');
              await page.fill(step.selector, step.value ?? '', { timeout: stepTimeout });
              break;
            }

            case 'wait_for': {
              if (step.selector) {
                await page.waitForSelector(step.selector, { timeout: stepTimeout });
              } else if (step.timeoutMs) {
                await page.waitForTimeout(Math.min(step.timeoutMs, 10000));
              }
              break;
            }

            case 'assert_visible': {
              if (!step.selector) throw new Error('Missing selector for assert_visible');
              await page.waitForSelector(step.selector, {
                state: 'visible',
                timeout: stepTimeout
              });
              break;
            }

            case 'assert_text': {
              if (!step.selector) throw new Error('Missing selector for assert_text');
              await page.waitForSelector(step.selector, { timeout: stepTimeout });
              const content = await page.textContent(step.selector);
              const expected = step.value ?? '';
              if (!content || !content.includes(expected)) {
                throw new Error(
                  `Text assertion failed on "${step.selector}". Expected to contain "${expected}", but found "${(content || '').trim()}".`
                );
              }
              break;
            }

            case 'assert_url': {
              const expectedUrl = step.value ?? '';
              const actualUrl = page.url();
              if (!actualUrl.includes(expectedUrl)) {
                throw new Error(
                  `URL assertion failed. Expected URL to include "${expectedUrl}", but got "${actualUrl}".`
                );
              }
              break;
            }

            case 'wait_for_response': {
              const urlPattern = step.url || '';
              const expectedStatus = step.statusCode;
              await page.waitForResponse(
                (res: any) => {
                  const matchesUrl = res.url().includes(urlPattern);
                  const matchesStatus = expectedStatus ? res.status() === expectedStatus : true;
                  return matchesUrl && matchesStatus;
                },
                { timeout: stepTimeout }
              );
              break;
            }

            default:
              throw new Error(`Unsupported step type: ${(step as any).type}`);
          }

          stepResults.push({
            stepIndex: idx,
            stepType: step.type,
            description: this.crypto.redact(
              step.description || `${step.type} ${step.selector || step.url || ''}`.trim(),
              secretValues
            ),
            status: 'passed',
            durationMs: Date.now() - stepStartTime
          });
        } catch (stepErr: any) {
          const rawErrMsg = stepErr.message || String(stepErr);
          const redactedErrMsg = this.crypto.redact(rawErrMsg, secretValues);

          stepResults.push({
            stepIndex: idx,
            stepType: step.type,
            description: this.crypto.redact(
              step.description || `${step.type} ${step.selector || step.url || ''}`.trim(),
              secretValues
            ),
            status: 'failed',
            durationMs: Date.now() - stepStartTime,
            error: redactedErrMsg
          });

          failedStepIndex = idx;
          failureReason = redactedErrMsg;
          status = rawErrMsg.toLowerCase().includes('timeout') ? 'timed_out' : 'failed';

          // Mark subsequent steps as skipped
          for (let skipIdx = idx + 1; skipIdx < options.steps.length; skipIdx++) {
            const skipped = options.steps[skipIdx];
            stepResults.push({
              stepIndex: skipIdx,
              stepType: skipped.type,
              description: this.crypto.redact(
                skipped.description || `${skipped.type} ${skipped.selector || skipped.url || ''}`.trim(),
                secretValues
              ),
              status: 'skipped',
              durationMs: 0
            });
          }

          // Capture failure screenshot and save to decoupled artifact storage
          try {
            if (page) {
              const buffer = await page.screenshot({
                type: 'jpeg',
                quality: 60,
                timeout: 4000
              });

              if (this.artifacts) {
                const artRecord = await this.artifacts.saveArtifact(
                  options.projectId,
                  options.runId,
                  'screenshot',
                  buffer,
                  'image/jpeg'
                );
                screenshotArtifactId = artRecord.id;
              } else {
                screenshotBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
              }
            }
          } catch (shotErr) {
            this.logger.warn(`Failed to capture screenshot on error: ${shotErr}`);
          }

          break; // Stop execution on first failed step
        }
      }

      if (page) {
        try {
          finalUrl = this.crypto.redact(page.url(), secretValues);
        } catch {
          // The page may already be gone; keep the previous URL.
        }
      }
    } catch (globalErr: any) {
      status = 'failed';
      failureReason = this.crypto.redact(globalErr.message || String(globalErr), secretValues);
    } finally {
      // Guaranteed resource teardown
      if (page) {
        try { await page.close(); } catch { /* already closed */ }
      }
      if (context) {
        try { await context.close(); } catch { /* already closed */ }
      }
      if (browserInstance) {
        try { await browserInstance.close(); } catch { /* already closed */ }
      }

      this.activeExecutions = Math.max(0, this.activeExecutions - 1);
      const curTenantActive = this.activePerTenant.get(options.projectId) || 1;
      if (curTenantActive <= 1) {
        this.activePerTenant.delete(options.projectId);
      } else {
        this.activePerTenant.set(options.projectId, curTenantActive - 1);
      }
    }

    const completedAt = new Date().toISOString();
    return {
      status,
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      failedStepIndex,
      failureReason,
      finalUrl,
      stepResults,
      consoleLogs,
      networkRequests,
      httpErrors,
      screenshotArtifactId,
      screenshotBase64
    };
  }
}
