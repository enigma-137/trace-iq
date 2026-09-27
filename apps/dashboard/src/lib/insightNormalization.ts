import type { InsightType } from '../types/analytics';

/**
 * Normalizes all backend query response shapes into a single canonical
 * structure consumed by InsightChartRenderer, TrendChart, BarChart, DonutChart, and KPI.
 */
export function normalizeInsightData(raw: any, type: InsightType = 'trend') {
  if (!raw) return null;

  let current = raw;
  if (current && typeof current === 'object' && current.data && typeof current.data === 'object') {
    current = current.data;
  }
  if (current && typeof current === 'object' && current.result && typeof current.result === 'object') {
    current = current.result;
  }

  // Web analytics normalization (topPages, topReferrers, totals)
  if (type === 'web_analytics') {
    const webTotals = current.current && typeof current.current === 'object' ? current.current : null;
    const prevTotals = current.previous && typeof current.previous === 'object' ? current.previous : null;

    const val = current.value ?? (webTotals ? (webTotals.visitors ?? webTotals.pageviews ?? webTotals.sessions) : current.totalVisitors ?? current.totalViews);
    const prevVal = typeof current.previous === 'number' ? current.previous : (prevTotals ? (prevTotals.visitors ?? prevTotals.pageviews) : undefined);

    let items = current.items;
    if (!items) {
      if (current.topPages && Array.isArray(current.topPages)) {
        items = current.topPages.map((p: any) => ({
          label: p.pathname || p.path || p.page || 'Unknown',
          value: Number(p.count ?? p.views ?? p.total ?? 0)
        }));
      } else if (current.topReferrers && Array.isArray(current.topReferrers)) {
        items = current.topReferrers.map((r: any) => ({
          label: r.referrer || r.domain || 'Direct / None',
          value: Number(r.count ?? r.views ?? r.total ?? 0)
        }));
      } else if (current.topBrowsers && Array.isArray(current.topBrowsers)) {
        items = current.topBrowsers.map((b: any) => ({
          label: b.browser || 'Unknown',
          value: Number(b.count ?? b.views ?? b.total ?? 0)
        }));
      } else if (current.topDevices && Array.isArray(current.topDevices)) {
        items = current.topDevices.map((d: any) => ({
          label: d.device || 'Unknown',
          value: Number(d.count ?? d.views ?? d.total ?? 0)
        }));
      } else if (current.topCountries && Array.isArray(current.topCountries)) {
        items = current.topCountries.map((c: any) => ({
          label: c.country || 'Unknown',
          value: Number(c.count ?? c.views ?? c.total ?? 0)
        }));
      }
    }

    return {
      ...current,
      value: typeof val === 'number' ? val : 0,
      previous: typeof prevVal === 'number' ? prevVal : undefined,
      items: items || current.items
    };
  }

  // API performance normalization (latencySeries, statusBreakdown)
  if (type === 'api_performance') {
    if (current.latencySeries && Array.isArray(current.latencySeries) && !current.series) {
      const buckets = current.latencySeries.map((s: any) => s.bucket);
      const p95Points = current.latencySeries.map((s: any) => ({
        bucket: s.bucket,
        value: Number(s.p95 ?? 0),
        total: Number(s.p95 ?? 0)
      }));
      const p50Points = current.latencySeries.map((s: any) => ({
        bucket: s.bucket,
        value: Number(s.p50 ?? 0),
        total: Number(s.p50 ?? 0)
      }));
      return {
        ...current,
        buckets,
        series: [
          { key: 'p95 Latency', points: p95Points },
          { key: 'p50 Latency', points: p50Points }
        ],
        items: current.statusBreakdown
          ? [
              { label: '200 OK', value: Number(current.statusBreakdown.ok200 ?? 0) },
              { label: '429 Rate Limited', value: Number(current.statusBreakdown.rateLimit429 ?? 0) },
              { label: '500 Server Error', value: Number(current.statusBreakdown.error500 ?? 0) }
            ]
          : current.items
      };
    }
  }

  // Event breakdown / Top events normalization
  if (type === 'event_breakdown' || type === 'top_events') {
    if (Array.isArray(current.breakdown) && !current.items) {
      return {
        ...current,
        items: current.breakdown.map((b: any) => ({
          label: b.propertyValue || b.key || b.label || 'Unknown',
          value: Number(b.total ?? b.value ?? b.count ?? 0)
        }))
      };
    }
    if (Array.isArray(current.events) && !current.items) {
      return {
        ...current,
        items: current.events.map((e: any) => ({
          label: e.eventName || e.name || e.event || 'Unknown',
          value: Number(e.total ?? e.value ?? e.count ?? 0)
        }))
      };
    }
  }

  // Series normalization: ensure points have both total & value
  if (current.series && Array.isArray(current.series)) {
    const normalizedSeries = current.series.map((s: any) => ({
      ...s,
      points: Array.isArray(s.points)
        ? s.points.map((pt: any) => ({
            ...pt,
            value: Number(pt.value ?? pt.total ?? 0),
            total: Number(pt.total ?? pt.value ?? 0)
          }))
        : []
    }));
    return {
      ...current,
      series: normalizedSeries
    };
  }

  return current;
}
