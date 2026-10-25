import {
  TraceMap,
  AnyMap,
  originalPositionFor,
  sourceContentFor,
  type SourceMapInput
} from '@jridgewell/trace-mapping';

/** A stack line that points at a position in a JavaScript file. */
export interface PositionedFrame {
  /** `v8` is "at fn (url:line:col)" or "at url:line:col"; `gecko` is "fn@url:line:col" (Firefox, Safari). */
  format: 'v8' | 'gecko';
  indent: string;
  fn: string;
  url: string;
  line: number;
  /** 1-based, as browsers and Node print it. */
  column: number;
}

export interface OriginalPosition {
  source: string;
  line: number;
  /** 1-based. */
  column: number;
  name: string | null;
}

export interface SourceContext {
  file: string;
  line: number;
  lines: Array<{ line: number; code: string }>;
}

export interface SymbolicatedStack {
  stack: string;
  /** How many frames were mapped to original source. */
  mappedFrames: number;
  /** Code around the first mapped frame outside node_modules, when the map embeds sources. */
  context: SourceContext | null;
}

const V8_FRAME = /^(\s*)at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
const GECKO_FRAME = /^(\s*)([^@\s]*)@(.+?):(\d+):(\d+)\s*$/;
const CONTEXT_LINES = 3;
const MAX_CONTEXT_LINE_LENGTH = 300;

export function parseFrameLine(text: string): PositionedFrame | null {
  const v8 = V8_FRAME.exec(text);
  if (v8) {
    return { format: 'v8', indent: v8[1], fn: v8[2] ?? '', url: v8[3], line: Number(v8[4]), column: Number(v8[5]) };
  }
  const gecko = GECKO_FRAME.exec(text);
  if (gecko && /[/.]/.test(gecko[3])) {
    return { format: 'gecko', indent: gecko[1], fn: gecko[2], url: gecko[3], line: Number(gecko[4]), column: Number(gecko[5]) };
  }
  return null;
}

/** The path part of a frame URL: no scheme, host, query or hash, and no leading slash. */
export function framePath(url: string): string {
  return url
    .trim()
    .replace(/\\/g, '/')
    .replace(/^[a-z][\w+.-]*:\/\/[^/]*/i, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/+/, '');
}

/**
 * Normalizes an uploaded map's file key the same way frame paths are, so
 * `./dist/app.js`, `/app.js` and `app.js` compare predictably.
 */
export function normalizeMapFile(file: string): string {
  return framePath(file).replace(/^(\.\/)+/, '');
}

/**
 * The uploaded file a frame belongs to: an exact path match, else the longest
 * file the frame path ends with at a directory boundary. A frame at
 * `/static/assets/index-3f2a.js` matches a map uploaded as `assets/index-3f2a.js`.
 */
export function matchMapFile<T extends { file: string }>(path: string, files: T[]): T | null {
  let best: T | null = null;
  for (const candidate of files) {
    const file = candidate.file;
    if (path === file || path.endsWith(`/${file}`)) {
      if (!best || file.length > best.file.length) best = candidate;
    }
  }
  return best;
}

/** Display form of a source path from a map: `webpack://app/./src/App.tsx` → `src/App.tsx`. */
export function cleanSourcePath(source: string): string {
  return source
    .replace(/^webpack:\/\/[^/]*\//, '')
    .replace(/^[a-z][\w+.-]*:\/\/\/?/i, '')
    .replace(/^(\.\.?\/)+/, '');
}

/** Parses a map (regular or indexed). Throws when it isn't a usable source map. */
export function loadTraceMap(input: string | object): TraceMap {
  const map = typeof input === 'string' ? (JSON.parse(input) as Record<string, unknown>) : (input as Record<string, unknown>);
  if (!map || typeof map !== 'object') throw new Error('Source map must be a JSON object.');
  if (Array.isArray(map.sections)) return AnyMap(map as unknown as SourceMapInput);
  if (typeof map.mappings !== 'string' || !Array.isArray(map.sources)) {
    throw new Error('Source map needs "mappings" and "sources".');
  }
  return new TraceMap(map as unknown as SourceMapInput);
}

/**
 * Rewrites a stack with original positions. `lookup` returns the parsed map for
 * a frame's URL, or null when none was uploaded for it. Function names come
 * from the calling frame's mapping (the name at the call site is the name of
 * the function this frame is in), falling back to the minified name.
 */
export async function symbolicateStack(
  stack: string,
  lookup: (url: string) => Promise<TraceMap | null>
): Promise<SymbolicatedStack> {
  const lines = stack.split(/\r?\n/);
  const frames = lines.map((text) => parseFrameLine(text));
  const resolved: Array<{ position: OriginalPosition; map: TraceMap } | null> = [];

  for (const frame of frames) {
    if (!frame) {
      resolved.push(null);
      continue;
    }
    const map = await lookup(frame.url);
    const position = map ? originalPositionFor(map, { line: frame.line, column: Math.max(0, frame.column - 1) }) : null;
    resolved.push(
      map && position?.source && position.line !== null
        ? {
            map,
            position: { source: position.source, line: position.line, column: (position.column ?? 0) + 1, name: position.name ?? null }
          }
        : null
    );
  }

  let mappedFrames = 0;
  let context: SourceContext | null = null;
  const output = lines.map((text, index) => {
    const frame = frames[index];
    const hit = resolved[index];
    if (!frame || !hit) return text;
    mappedFrames += 1;

    const callerIndex = frames.findIndex((other, otherIndex) => otherIndex > index && other !== null);
    const name = (callerIndex === -1 ? null : resolved[callerIndex]?.position.name) ?? (frame.fn || null);
    const file = cleanSourcePath(hit.position.source);
    const location = `${file}:${hit.position.line}:${hit.position.column}`;

    if (!context && !file.includes('node_modules/')) {
      context = sourceContext(hit.map, hit.position.source, file, hit.position.line);
    }

    if (frame.format === 'gecko') return `${frame.indent}${name ?? ''}@${location}`;
    return name ? `${frame.indent}at ${name} (${location})` : `${frame.indent}at ${location}`;
  });

  return { stack: output.join('\n'), mappedFrames, context };
}

function sourceContext(map: TraceMap, source: string, file: string, line: number): SourceContext | null {
  const content = sourceContentFor(map, source);
  if (!content) return null;
  const all = content.split(/\r?\n/);
  const start = Math.max(1, line - CONTEXT_LINES);
  const end = Math.min(all.length, line + CONTEXT_LINES);
  const lines: SourceContext['lines'] = [];
  for (let n = start; n <= end; n += 1) {
    lines.push({ line: n, code: all[n - 1].slice(0, MAX_CONTEXT_LINE_LENGTH) });
  }
  return lines.length > 0 ? { file, line, lines } : null;
}
