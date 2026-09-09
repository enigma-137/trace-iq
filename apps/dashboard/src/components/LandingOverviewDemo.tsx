'use client';

import { useEffect, useMemo, useState } from 'react';
import { DonutChart } from '@/components/charts/DonutChart';
import { OverviewTabbedChart, type TabbedChartPoint } from '@/components/charts/OverviewTabbedChart';
import { PaceStatTile } from '@/components/charts/PaceStatTile';
import { TopEventsList } from '@/components/charts/TopEventsList';

const TREND_POINTS: TabbedChartPoint[] = [
  { bucket: 'Aug 24', events: 42, apiCalls: 0, errors: 1 },
  { bucket: 'Aug 25', events: 8, apiCalls: 0, errors: 0 },
  { bucket: 'Aug 26', events: 118, apiCalls: 0, errors: 1 },
  { bucket: 'Aug 27', events: 39, apiCalls: 0, errors: 2 },
  { bucket: 'Aug 28', events: 12, apiCalls: 0, errors: 1 },
  { bucket: 'Aug 29', events: 11, apiCalls: 0, errors: 0 },
  { bucket: 'Aug 30', events: 251, apiCalls: 0, errors: 2 },
  { bucket: 'Aug 31', events: 92, apiCalls: 0, errors: 1 },
  { bucket: 'Sep 1', events: 26, apiCalls: 0, errors: 0 },
  { bucket: 'Sep 2', events: 107, apiCalls: 0, errors: 1 },
  { bucket: 'Sep 3', events: 34, apiCalls: 76, errors: 1 },
  { bucket: 'Sep 4', events: 119, apiCalls: 83, errors: 0 },
  { bucket: 'Sep 5', events: 105, apiCalls: 129, errors: 1 },
  { bucket: 'Sep 6', events: 51, apiCalls: 22, errors: 0 }
];

const TOP_EVENTS = [
  { eventName: 'page_exited', total: 963 },
  { eventName: '$page', total: 633 },
  { eventName: 'page_viewed', total: 630 },
  { eventName: 'element_clicked', total: 477 },
  { eventName: '$api_request', total: 455 },
  { eventName: '$identify', total: 216 }
];

const DEVICES = [
  { label: 'Windows', value: 2780, color: '#3b82f6' },
  { label: 'Android', value: 1450, color: '#6366f1' },
  { label: 'Linux', value: 880, color: '#06b6d4' },
  { label: 'macOS', value: 630, color: '#10b981' },
  { label: 'unknown', value: 380, color: '#f59e0b' },
  { label: 'iOS', value: 180, color: '#ec4899' }
];

const REFERRERS = [
  { label: 'Direct / None', value: 2450, color: '#3b82f6' },
  { label: 'Google Search', value: 1760, color: '#10b981' },
  { label: 'GitHub', value: 1010, color: '#8b5cf6' },
  { label: 'Twitter / X', value: 570, color: '#06b6d4' },
  { label: 'LinkedIn', value: 320, color: '#f59e0b' },
  { label: 'Product Hunt', value: 190, color: '#ec4899' }
];

const ACTIVITY = [
  { id: 'activity-1', name: 'Page exited', path: '/dashboard', age: 'now' },
  { id: 'activity-2', name: 'API request', path: '/v1/dashboard/overview', age: '12s' },
  { id: 'activity-3', name: 'Element clicked', path: '/dashboard/insights', age: '31s' },
  { id: 'activity-4', name: 'Page viewed', path: '/dashboard/replays', age: '1m' },
  { id: 'activity-5', name: 'Identify', path: '/dashboard', age: '2m' }
];

export function LandingOverviewDemo() {
  const [paused, setPaused] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [selectedActivity, setSelectedActivity] = useState(ACTIVITY[0].id);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActivityOffset((current) => (current + 1) % ACTIVITY.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [paused]);

  const visibleActivity = useMemo(
    () => ACTIVITY.map((_, index) => ACTIVITY[(index + activityOffset) % ACTIVITY.length]).slice(0, 4),
    [activityOffset]
  );

  return (
    <div className="landing-overview-demo dark">
      {/* Starting directly with Total Event cards (KPI section) */}
      <section className="landing-overview-kpis" aria-label="Sample product metrics">
        <PaceStatTile title="Total Events" value={3990} badge="+20%" badgeTone="green" badgeIcon="up" description="390 last 24h" />
        <PaceStatTile title="P95 Latency" value="8354.5ms" badge="-32ms" badgeTone="green" badgeIcon="down" description="Avg 8979.3ms" />
        <PaceStatTile title="Failure Rate (5xx)" value="8.43%" badge="+1 type" badgeTone="red" badgeIcon="up" description="5 exception occurrences" />
        <PaceStatTile title="Identified Profiles" value={9} suffix="people" badge="+287" badgeTone="blue" badgeIcon="up" description="287 active sessions" />
      </section>

      <section className="landing-overview-main">
        <div className="landing-overview-left flex flex-col gap-3">
          <OverviewTabbedChart data={TREND_POINTS} className="landing-overview-trend" />

          {/* Two Pie/Donut Charts: Devices & Referrers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <section className="landing-overview-card">
              <div className="landing-overview-card-header">
                <strong>Devices (30 days)</strong>
                <span>6.3k events</span>
              </div>
              <div className="pt-2">
                <DonutChart
                  items={DEVICES}
                  size={120}
                  thickness={18}
                  centerValue="6.3K"
                  centerLabel="EVENTS"
                  className="justify-between"
                />
              </div>
            </section>

            <section className="landing-overview-card">
              <div className="landing-overview-card-header">
                <strong>Referrers (30 days)</strong>
                <span>6.3k events</span>
              </div>
              <div className="pt-2">
                <DonutChart
                  items={REFERRERS}
                  size={120}
                  thickness={18}
                  centerValue="6.3K"
                  centerLabel="EVENTS"
                  className="justify-between"
                />
              </div>
            </section>
          </div>
        </div>

        <div className="landing-overview-side">
          <section className="landing-overview-card landing-overview-activity">
            <div className="landing-overview-card-header">
              <p><span className="landing-overview-live-dot" /><small>Now</small> 5 events · 1 unique</p>
              <button type="button" onClick={() => setPaused((current) => !current)} aria-pressed={paused}>
                {paused ? 'Resume' : 'Pause'}
              </button>
            </div>
            <ul>
              {visibleActivity.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className={selectedActivity === event.id ? 'is-selected' : ''}
                    onMouseEnter={() => setSelectedActivity(event.id)}
                    onFocus={() => setSelectedActivity(event.id)}
                    onClick={() => setSelectedActivity(event.id)}
                  >
                    <span><strong>{event.name}</strong><small>{event.path}</small></span>
                    <time>{event.age}</time>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="landing-overview-card landing-overview-events">
            <div className="landing-overview-card-header"><strong>Event volume breakdown</strong><span>Hover a row</span></div>
            <TopEventsList events={TOP_EVENTS} />
          </section>
        </div>
      </section>
    </div>
  );
}
