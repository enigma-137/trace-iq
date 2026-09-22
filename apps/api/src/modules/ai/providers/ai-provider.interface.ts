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

export interface AiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface AiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: AiToolCall[];
}

export interface AiChatOptions {
  model: string;
  messages: AiChatMessage[];
  tools?: AiToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AiChatResponse {
  content: string;
  toolCalls?: AiToolCall[];
  finishReason?: string;
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
  chat(options: AiChatOptions): Promise<AiChatResponse>;
}
