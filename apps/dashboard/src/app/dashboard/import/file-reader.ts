/**
 * Reads an events file in the browser without loading JSON Lines files into memory
 * at once: gzip is detected from the first bytes, JSON Lines is streamed line by
 * line, and a JSON array (or a `{ "results": [...] }` API response) is parsed whole.
 */

export type ImportFormat = 'posthog' | 'traceiq';

export type FileRow = { value: unknown } | { error: string };

async function isGzip(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  return head[0] === 0x1f && head[1] === 0x8b;
}

async function textStream(file: Blob): Promise<ReadableStream<string>> {
  let bytes: ReadableStream<Uint8Array> = file.stream();
  if (await isGzip(file)) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read gzipped files. Unzip the file first, or use the CLI.');
    }
    bytes = bytes.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  }
  return bytes.pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>);
}

function unwrap(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.results)) return record.results;
    if (Array.isArray(record.events)) return record.events; // a saved TraceIQ export API response
    return [record];
  }
  throw new Error('Expected JSON Lines, a JSON array of events, or an object with a "results" array.');
}

export async function* readEventsFile(file: Blob): AsyncGenerator<FileRow> {
  const reader = (await textStream(file)).getReader();
  let buffer = '';
  let mode: 'unknown' | 'lines' | 'whole' = 'unknown';

  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;

    if (mode === 'unknown') {
      const trimmed = buffer.trimStart();
      if (!trimmed && !done) continue;
      if (trimmed.startsWith('[')) {
        mode = 'whole';
      } else {
        const newline = trimmed.indexOf('\n');
        if (newline === -1 && !done) continue;
        const firstLine = newline === -1 ? trimmed : trimmed.slice(0, newline);
        try {
          const parsed = JSON.parse(firstLine) as Record<string, unknown>;
          mode = parsed && typeof parsed === 'object' && !('results' in parsed) && !('events' in parsed && Array.isArray(parsed.events)) ? 'lines' : 'whole';
        } catch {
          mode = 'whole'; // pretty-printed JSON spans several lines
        }
      }
    }

    if (mode === 'lines') {
      const lines = buffer.split('\n');
      buffer = done ? '' : lines.pop() ?? '';
      for (const line of lines) {
        const text = line.trim();
        if (!text) continue;
        try {
          yield { value: JSON.parse(text) };
        } catch {
          yield { error: 'not valid JSON' };
        }
      }
    }

    if (done) break;
  }

  if (mode === 'whole') {
    let rows: unknown[];
    try {
      rows = unwrap(JSON.parse(buffer));
    } catch (error) {
      throw new Error(error instanceof Error && error.message.startsWith('Expected') ? error.message : 'The file is not valid JSON or JSON Lines.');
    }
    for (const value of rows) yield { value };
  }
}

/** PostHog events carry `event` + `distinct_id`; TraceIQ events carry `eventName`. */
export function detectFormat(row: unknown): ImportFormat | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if ('eventName' in record) return 'traceiq';
  if ('event' in record || 'distinct_id' in record) return 'posthog';
  return null;
}
