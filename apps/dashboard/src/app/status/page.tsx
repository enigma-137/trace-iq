import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import { apiBaseUrl } from '@/lib/dashboard';
import { StatusView, type StatusData, type StatusComponentData, type StatusDay } from './StatusView';

// Rebuilt at most every 30 seconds. The browser never calls the API: it only
// receives the sanitized summary below, so no API host, error or internal detail
// appears in the network tab.
export const revalidate = 30;

const COMPONENT_STATUSES = ['operational', 'degraded', 'down', 'unknown'] as const;
const LEVELS = ['operational', 'degraded', 'down', 'none'] as const;
const OVERALL = ['operational', 'degraded', 'down'] as const;
const MAX_DAYS = 90;
// The API refreshes its summary every 30 seconds and this page caches it for 30
// more. If the API stops answering, Next keeps serving the last cached copy, so
// anything older than two minutes is treated as the API being unreachable.
const STALE_AFTER_MS = 2 * 60_000;

export default async function StatusPage() {
  const data = await loadStatus();
  return (
    <LandingSiteChrome>
      <StatusView data={data} />
    </LandingSiteChrome>
  );
}

async function loadStatus(): Promise<StatusData> {
  try {
    const response = await fetch(`${apiBaseUrl}/v1/status`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) return unreachable();
    const data = sanitize(await response.json());
    if (!data || Date.now() - Date.parse(data.generatedAt) > STALE_AFTER_MS) return unreachable();
    return data;
  } catch {
    return unreachable();
  }
}

function unreachable(): StatusData {
  return { reachable: false, status: 'down', generatedAt: new Date().toISOString(), days: MAX_DAYS, components: [] };
}

/** Copies only known fields so nothing unexpected from the API reaches the client. */
function sanitize(value: unknown): StatusData | null {
  if (!isRecord(value) || !Array.isArray(value.components) || typeof value.generatedAt !== 'string') return null;
  const status = oneOf(value.status, OVERALL);
  if (!status || !Number.isFinite(Date.parse(value.generatedAt))) return null;
  const components = value.components.flatMap((component): StatusComponentData[] => {
    if (!isRecord(component) || typeof component.key !== 'string' || typeof component.name !== 'string') return [];
    const componentStatus = oneOf(component.status, COMPONENT_STATUSES);
    if (!componentStatus || !Array.isArray(component.history)) return [];
    const history = component.history.slice(-MAX_DAYS).flatMap((day): StatusDay[] => {
      if (!isRecord(day) || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return [];
      const level = oneOf(day.level, LEVELS);
      return level ? [{ date: day.date, level, uptimePercent: percent(day.uptimePercent) }] : [];
    });
    return [{
      key: component.key.slice(0, 32),
      name: component.name.slice(0, 64),
      description: typeof component.description === 'string' ? component.description.slice(0, 120) : '',
      status: componentStatus,
      uptimePercent: percent(component.uptimePercent),
      history
    }];
  });
  return {
    reachable: true,
    status,
    generatedAt: new Date(value.generatedAt).toISOString(),
    days: Math.min(MAX_DAYS, Math.max(...components.map((component) => component.history.length), 1)),
    components
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : null;
}

function percent(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}
