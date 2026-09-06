'use client';

import { useEffect, useMemo, useState } from 'react';
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

const ACTIVITY = [
  { id: 'activity-1', name: 'Page exited', path: '/dashboard', age: 'now' },
  { id: 'activity-2', name: 'API request', path: '/v1/dashboard/overview', age: '12s' },
  { id: 'activity-3', name: 'Element clicked', path: '/dashboard/insights', age: '31s' },
  { id: 'activity-4', name: 'Page viewed', path: '/dashboard/replays', age: '1m' },
  { id: 'activity-5', name: 'Identify', path: '/dashboard', age: '2m' }
];

const STORY_FACTS = [
  { label: 'Today', value: '393', detail: '393 events have arrived in the current reporting day.' },
  { label: 'Delta', value: '+101%', detail: 'Activity is 101% higher than the previous comparable period.' },
  { label: 'Users today', value: '17', detail: '17 unique people have been active today.' },
  { label: 'Top event', value: '$api_request', detail: 'API requests are the most frequent event in this sample.' },
  { label: 'Active now', value: '1', detail: 'One visitor is active in the last 15 minutes.' }
];

export function LandingOverviewDemo() {
  const [paused, setPaused] = useState(false);
  const [activityOffset, setActivityOffset] = useState(0);
  const [selectedActivity, setSelectedActivity] = useState(ACTIVITY[0].id);
  const [activeFact, setActiveFact] = useState(0);

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
      <div className="landing-overview-titlebar">
        <div>
          <span className="landing-overview-live-dot" />
          <strong>Overview</strong>
        </div>
        <span>Interactive sample data</span>
      </div>

      <section className="landing-overview-story" aria-label="Sample activity summary">
        <p><strong>Demo Workspace</strong> saw a big jump in activity, with 393 events in the past 24 hours.</p>
        <div className="landing-overview-facts" onMouseLeave={() => setActiveFact(0)}>
          {STORY_FACTS.map((fact, index) => (
            <button
              type="button"
              key={fact.label}
              className={index === activeFact ? 'is-active' : ''}
              onMouseEnter={() => setActiveFact(index)}
              onFocus={() => setActiveFact(index)}
              aria-describedby="landing-overview-fact-detail"
            >
              <span>{fact.label}</span> {fact.value}
            </button>
          ))}
        </div>
        <p id="landing-overview-fact-detail" className="landing-overview-fact-detail" aria-live="polite">
          {STORY_FACTS[activeFact].detail}
        </p>
      </section>

      <section className="landing-overview-availability" aria-label="Ingestion status">
        <div><span className="landing-overview-live-dot" /><p><small>Ingestion</small><strong>Healthy</strong></p></div>
        <p><small>Last event</small><strong>moments ago</strong></p>
        <p><small>Last hour</small><strong>80</strong></p>
        <p><small>Last 24 hours</small><strong>390</strong></p>
      </section>

      <section className="landing-overview-kpis" aria-label="Sample product metrics">
        <PaceStatTile title="Total Events" value={3990} badge="+20%" badgeTone="green" badgeIcon="up" description="390 last 24h" />
        <PaceStatTile title="P95 Latency" value="8354.5ms" badge="-32ms" badgeTone="green" badgeIcon="down" description="Avg 8979.3ms" />
        <PaceStatTile title="Failure Rate (5xx)" value="8.43%" badge="+1 type" badgeTone="red" badgeIcon="up" description="5 exception occurrences" />
        <PaceStatTile title="Identified Profiles" value={9} suffix="people" badge="+287" badgeTone="blue" badgeIcon="up" description="287 active sessions" />
      </section>

      <section className="landing-overview-main">
        <OverviewTabbedChart data={TREND_POINTS} className="landing-overview-trend" />

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
