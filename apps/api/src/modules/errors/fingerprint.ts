import { createHash } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export const EXCEPTION_EVENT = '$exception';
export const FINGERPRINT_PROPERTY = '$fingerprint';

/** Frames that make up a fingerprint. More frames split issues on harmless call-path differences. */
const MAX_FRAMES = 5;
const MAX_CUSTOM_FINGERPRINT = 200;

export interface StackFrame {
  fn: string;
  file: string;
  inApp: boolean;
}

// Python:  File "/app/x.py", line 12, in handler
const PYTHON_FRAME = /^\s*File "([^"]+)", line \d+, in (.+?)\s*$/;
const LINE_COLUMN = /(?::\d+){1,2}$/;

/**
 * Parses a stack trace into frames, innermost first, ignoring lines that don't
 * look like frames (the "Error: message" header, "    ... 3 more", etc.).
 * Handles V8/Node ("at fn (file:1:2)"), Firefox/Safari ("fn@file:1:2") and
 * Python tracebacks.
 */
export function parseStack(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];
  const pythonFrames: StackFrame[] = [];

  for (const rawLine of stack.split(/\r?\n/)) {
    const line = rawLine.trim();

    const python = PYTHON_FRAME.exec(line);
    if (python) {
      pythonFrames.push(toFrame(python[2], python[1]));
      continue;
    }

    if (line.startsWith('at ')) {
      // "at fn (location)" or "at location"
      const body = line.slice(3).trim();
      const open = body.lastIndexOf(' (');
      if (body.endsWith(')') && open !== -1) {
        frames.push(toFrame(body.slice(0, open), body.slice(open + 2, -1)));
      } else {
        frames.push(toFrame('', body));
      }
      continue;
    }

    const at = line.indexOf('@');
    if (at !== -1) {
      const location = line.slice(at + 1);
      // Require something path-like so "user@example.com failed" isn't a frame.
      if (LINE_COLUMN.test(location) || /^[a-z][\w+.-]*:\/\//i.test(location)) {
        frames.push(toFrame(line.slice(0, at), location));
      }
    }
  }

  // Python tracebacks list the innermost call last.
  return frames.length > 0 ? frames : pythonFrames.reverse();
}

function toFrame(fn: string, location: string): StackFrame {
  const file = location.trim().replace(LINE_COLUMN, '');
  const normalizedFile = normalizeFile(file);
  return {
    fn: normalizeFunction(fn),
    file: normalizedFile,
    inApp: isInApp(normalizedFile, file)
  };
}

/**
 * Makes a file reference stable across deploys and hosts: drops the origin,
 * query string and hash, and content hashes baked into bundle file names.
 */
export function normalizeFile(file: string): string {
  let value = file.trim().replace(/\\/g, '/');
  value = value.replace(/^webpack-internal:\/\/\/(\([^)]*\)\/)?/, '');
  value = value.replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, ''); // scheme + host
  value = value.replace(/[?#].*$/, '');
  value = value.replace(/^[A-Za-z]:/, ''); // Windows drive
  // main.3f2a9c1b.js, page-8f3e2a1c9b0d4e5f.js, chunk-ABCD1234.mjs, index-BqT3x_9a.js
  value = value.replace(/([.-])(?=[A-Za-z0-9_]*\d)[A-Za-z0-9_]{8,}(?=\.(?:m?js|cjs|jsx?|tsx?)$)/, '');
  return value;
}

/** Minified names (`e`, `t`, `nr`) change on every build, so they don't identify a frame. */
function normalizeFunction(fn: string): string {
  const name = fn.trim().replace(/^(?:new|async)\s+/, '');
  if (!name || name === '<anonymous>' || name.length <= 2) return '?';
  return name;
}

function isInApp(normalizedFile: string, rawFile: string): boolean {
  if (!normalizedFile) return false;
  if (/node_modules\//.test(normalizedFile)) return false;
  if (/^node:|^internal\/|<anonymous>|^native$/.test(rawFile.trim())) return false;
  if (/^(chrome|moz|safari(-web)?)-extension:/.test(rawFile.trim())) return false;
  if (/site-packages\/|dist-packages\/|\/lib\/python\d/.test(normalizedFile)) return false;
  return true;
}

/**
 * Replaces the variable parts of an error message (ids, numbers, quoted values)
 * so "User 123 not found" and "User 456 not found" group together.
 */
export function normalizeMessage(message: string): string {
  return message
    .trim()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b[0-9a-f]{12,}\b/gi, '<hex>')
    .replace(/(["'`]).*?\1/g, '<str>')
    .replace(/\d+(\.\d+)?/g, '<n>')
    .slice(0, 500);
}

/**
 * Stable grouping key for an exception. Prefers the top in-app stack frames
 * (function + file, no line numbers) so a message that embeds variable data
 * still groups as one issue; falls back to type + normalized message.
 */
export function computeExceptionFingerprint(input: { type?: unknown; message?: unknown; stack?: unknown }): string {
  const type = typeof input.type === 'string' && input.type.trim() ? input.type.trim() : 'Error';
  const message = typeof input.message === 'string' ? input.message : '';
  const stack = typeof input.stack === 'string' ? input.stack : '';

  const frames = stack ? parseStack(stack) : [];
  const inApp = frames.filter((frame) => frame.inApp);
  const chosen = (inApp.length > 0 ? inApp : frames).slice(0, MAX_FRAMES);

  const key =
    chosen.length > 0
      ? ['stack', type, ...chosen.map((frame) => `${frame.fn}@${frame.file}`)].join('\n')
      : ['message', type, normalizeMessage(message)].join('\n');

  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * Ingest hook: stamps `$exception` events with a fingerprint unless the SDK
 * already sent one (custom grouping). Other events pass through untouched.
 */
export function withExceptionFingerprint(eventName: string, properties: JsonObject | undefined): JsonObject | undefined {
  if (eventName !== EXCEPTION_EVENT) return properties;

  const props = properties ?? {};
  const custom = props[FINGERPRINT_PROPERTY];
  if (typeof custom === 'string' && custom.trim()) {
    return { ...props, [FINGERPRINT_PROPERTY]: custom.trim().slice(0, MAX_CUSTOM_FINGERPRINT) };
  }

  return {
    ...props,
    [FINGERPRINT_PROPERTY]: computeExceptionFingerprint({ type: props.type, message: props.message, stack: props.stack })
  };
}
