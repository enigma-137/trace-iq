import type { ColumnGroup, ConnectionFlow, NodeItem } from '@/components/charts/SvgNodeFlowGraph';
import { SDK_VERSIONS } from '@/lib/sdkVersions';

interface ApiFlowEndpoint {
  method: string;
  path: string;
  count: number;
  avg: number;
  p95: number;
  status: number;
  errors: number;
}

export interface ApiFlowGraphData {
  mostRequests?: ApiFlowEndpoint[];
}

export function buildApiFlowGraph(
  data?: ApiFlowGraphData | null
): { columns: ColumnGroup[]; connections: ConnectionFlow[] } {
  const endpoints = data?.mostRequests?.slice(0, 4) ?? [];

  const endpointNodes: NodeItem[] = endpoints.length > 0
    ? endpoints.map((endpoint, index) => ({
        id: `ep-${index}`,
        title: `${endpoint.method} ${endpoint.path}`,
        description: `p95: ${formatApiFlowMs(endpoint.p95)} · avg: ${formatApiFlowMs(endpoint.avg)}`,
        countBadge: endpoint.count > 0 ? endpoint.count.toLocaleString() : '0',
        status: endpoint.errors > 0 ? 'critical' : endpoint.p95 > 250 ? 'warning' : 'healthy',
        tags: [endpoint.method, `${endpoint.status || 200}`]
      }))
    : [
        { id: 'ep-0', title: 'GET /v1/events', description: 'p95: 42ms · avg: 18ms', countBadge: '14,200', status: 'healthy', tags: ['GET', '200'] },
        { id: 'ep-1', title: 'POST /v1/telemetry', description: 'p95: 180ms · avg: 95ms', countBadge: '8,450', status: 'healthy', tags: ['POST', '200'] },
        { id: 'ep-2', title: 'GET /v1/dashboard/web', description: 'p95: 310ms · avg: 140ms', countBadge: '3,120', status: 'warning', tags: ['GET', '200'] },
        { id: 'ep-3', title: 'POST /v1/funnels/query', description: 'p95: 580ms · avg: 240ms', countBadge: '890', status: 'critical', tags: ['POST', '500'] }
      ];

  const columns: ColumnGroup[] = [
    {
      id: 'clients',
      title: 'Clients & SDKs',
      subtitle: 'Ingestion entry points',
      nodes: [
        { id: 'c-web', title: 'Browser SDK', description: 'Autocapture & SPA telemetry', countBadge: '65%', status: 'healthy', tags: ['js', `v${SDK_VERSIONS.javascript}`] },
        { id: 'c-middleware', title: 'Node.js Express / Next', description: 'Server middleware hooks', countBadge: '25%', status: 'healthy', tags: ['node', 'http'] },
        { id: 'c-python', title: 'Python SDK / FastAPI', description: 'Backend service traces', countBadge: '10%', status: 'info', tags: ['python'] }
      ]
    },
    {
      id: 'endpoints',
      title: 'API Endpoints',
      subtitle: 'HTTP Router & Handlers',
      nodes: endpointNodes
    },
    {
      id: 'processing',
      title: 'Processing Layer',
      subtitle: 'Services & Aggregators',
      nodes: [
        { id: 'p-auth', title: 'Auth & Rate Limiter', description: 'Token validation & quotas', countBadge: '100%', status: 'healthy', tags: ['jwt', 'redis'] },
        { id: 'p-engine', title: 'TraceIQ Ingest Engine', description: 'Event parsing & schema validation', countBadge: '99.8%', status: 'healthy', tags: ['buffer'] },
        { id: 'p-aggregator', title: 'Metrics Aggregator', description: 'Rollups & anomaly calculation', countBadge: 'p95: 12ms', status: 'warning', tags: ['worker'] }
      ]
    },
    {
      id: 'storage',
      title: 'Storage & Downstream',
      subtitle: 'Databases & Queue',
      nodes: [
        { id: 's-clickhouse', title: 'ClickHouse Column DB', description: 'High-speed event analytics', countBadge: 'Active', status: 'healthy', tags: ['olap'] },
        { id: 's-postgres', title: 'PostgreSQL DB', description: 'Projects, users & funnels', countBadge: 'Active', status: 'healthy', tags: ['relational'] },
        { id: 's-redis', title: 'Redis Cache & Queue', description: 'Session cache & rate limit store', countBadge: 'Active', status: 'healthy', tags: ['in-memory'] }
      ]
    }
  ];

  const connections: ConnectionFlow[] = [
    { fromId: 'c-web', toId: endpointNodes[0]?.id ?? 'ep-0', status: 'healthy', animated: true },
    { fromId: 'c-web', toId: endpointNodes[1]?.id ?? 'ep-1', status: 'healthy', animated: true },
    { fromId: 'c-middleware', toId: endpointNodes[2]?.id ?? 'ep-2', status: 'warning', animated: true },
    { fromId: 'c-python', toId: endpointNodes[3]?.id ?? 'ep-3', status: 'critical', animated: true },
    { fromId: endpointNodes[0]?.id ?? 'ep-0', toId: 'p-auth', status: 'healthy', animated: true },
    { fromId: endpointNodes[1]?.id ?? 'ep-1', toId: 'p-engine', status: 'healthy', animated: true },
    { fromId: endpointNodes[2]?.id ?? 'ep-2', toId: 'p-engine', status: 'warning', animated: true },
    { fromId: endpointNodes[3]?.id ?? 'ep-3', toId: 'p-aggregator', status: 'critical', animated: true },
    { fromId: 'p-auth', toId: 's-redis', status: 'healthy', animated: true },
    { fromId: 'p-engine', toId: 's-clickhouse', status: 'healthy', animated: true },
    { fromId: 'p-engine', toId: 's-postgres', status: 'healthy', animated: true },
    { fromId: 'p-aggregator', toId: 's-clickhouse', status: 'critical', animated: true }
  ];

  return { columns, connections };
}

function formatApiFlowMs(value: number): string {
  if (!Number.isFinite(value)) return '0 ms';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}
