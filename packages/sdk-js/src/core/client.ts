import type { TraceIQClient, TraceIQGroup, TraceIQIdentity, TraceIQInitOptions } from '../types';

export class BrowserTraceIQClient implements TraceIQClient {
  private options?: TraceIQInitOptions;

  initialize(options: TraceIQInitOptions): void {
    this.options = options;
  }

  identify(identity: TraceIQIdentity): void {
    void identity;
  }

  track(eventName: string, properties: Record<string, unknown> = {}): void {
    void eventName;
    void properties;
  }

  page(name?: string, properties: Record<string, unknown> = {}): void {
    void name;
    void properties;
  }

  group(group: TraceIQGroup): void {
    void group;
  }

  get initialized(): boolean {
    return Boolean(this.options);
  }
}
