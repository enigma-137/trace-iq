export type JsonScalar = null | boolean | number | string;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SchemaProperty {
  type?: 'string' | 'number' | 'integer' | 'boolean' | 'array';
  enum?: (string | number)[];
  items?: { type?: string };
  description?: string;
  default?: JsonValue;
}

export interface InputSchema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface Tool {
  name: string;
  /** Short display title, e.g. "Explain conversion drop". */
  title?: string;
  description: string;
  /** Documented minimum scopes a PAT needs to call this tool. Mirrors the API's requireScope(). */
  requiredScopes: string[];
  annotations: ToolAnnotations;
  schema: InputSchema;
  handler: (args: JsonObject) => Promise<unknown>;
}