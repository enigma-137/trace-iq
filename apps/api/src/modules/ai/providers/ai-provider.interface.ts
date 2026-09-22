export interface AiCompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  systemPrompt: string;
  userPrompt: string;
}

export interface AiCompletionResponse {
  content: string;
  requestedModel: string;
  routedModel: string;
  inputTokens?: number;
  outputTokens?: number;
  providerRequestId?: string;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  isConfigured(): boolean;
  complete(options: AiCompletionOptions): Promise<AiCompletionResponse>;
}
