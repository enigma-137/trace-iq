import { InputSchema, JsonObject, JsonValue } from './types.js';

/**
 * Validates MCP tool arguments against an input schema, applying property
 * defaults and rejecting unknown fields. Throws a helpful Error on the first
 * problem so AI clients see exactly what to fix.
 */
export function validateArgs(schema: InputSchema, raw: unknown): JsonObject {
  const input =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as JsonObject) : {};

  const out: JsonObject = {};
  const required = schema.required ?? [];

  for (const key of Object.keys(schema.properties)) {
    const prop = schema.properties[key];
    let value = input[key];

    if (value === undefined || value === null || value === '') {
      if (prop.default !== undefined && value === undefined) {
        value = prop.default as JsonValue;
      } else if (required.includes(key)) {
        throw new Error(`Missing required argument "${key}".`);
      } else {
        continue;
      }
    }

    if (value === undefined) continue;
    out[key] = validateValue(key, prop, value);
  }

  if (schema.additionalProperties === false) {
    const unexpected = Object.keys(input).filter((key) => !(key in schema.properties));
    if (unexpected.length > 0) {
      throw new Error(`Unexpected argument(s): ${unexpected.join(', ')}.`);
    }
  }

  return out;
}

function validateValue(key: string, prop: InputSchema['properties'][string], value: JsonValue): JsonValue {
  const type = prop.type;

  if (type === 'string') {
    if (typeof value !== 'string') {
      throw new Error(`"${key}" must be a string.`);
    }
    if (prop.enum && !prop.enum.includes(value)) {
      throw new Error(`"${key}" must be one of: ${prop.enum.join(', ')}.`);
    }
    return value;
  }

  if (type === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`"${key}" must be a boolean.`);
    return value;
  }

  if (type === 'number' || type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`"${key}" must be a number.`);
    }
    if (type === 'integer' && !Number.isInteger(value)) {
      throw new Error(`"${key}" must be an integer.`);
    }
    return value;
  }

  if (type === 'array') {
    if (!Array.isArray(value)) throw new Error(`"${key}" must be an array.`);
    if (prop.items?.type === 'string') {
      for (const item of value) {
        if (typeof item !== 'string') throw new Error(`"${key}" must be an array of strings.`);
      }
    }
    return value;
  }

  // No type constraint declared — accept as-is (e.g. pass-through object body).
  return typeof value === 'object' ? (value as JsonObject) : value;
}