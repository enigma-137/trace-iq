'use client';

import { useState, type KeyboardEvent } from 'react';
import { Activity, BarChart3, CircleAlert, House, Info, Layers, CalendarDays } from 'lucide-react';
import styles from '@/app/landing-light.module.css';

const views = [
  { key: 'behavior', label: 'Understand behavior', title: 'Product overview', description: 'Explore event data, errors, and performance — all in one place.', chart: 'Event volume', unit: 'events', ticks: ['60K', '40K', '20K', '0'], values: [10, 16, 23, 29, 22, 30, 39, 52, 33, 29], stats: [['Total events', '482K'], ['Active users', '24.3K'], ['Errors', '220'], ['P95 latency', '320 ms']], activity: 'Recent events', entries: [['user_signed_up', 'user_38492 · web', '2m ago'], ['checkout_error', 'error · Payment declined', '4m ago'], ['page_view', '/pricing · web', '6m ago'], ['subscription_created', 'user_91233 · pro plan', '8m ago']] },
  { key: 'errors', label: 'Investigate errors', title: 'Error context', description: 'Connect exceptions to the user actions that came before them.', chart: 'Errors over time', unit: 'errors', ticks: ['60', '40', '20', '0'], values: [45, 39, 55, 31, 35, 23, 29, 19, 15, 9], stats: [['Captured errors', '220'], ['Affected users', '84'], ['Error groups', '12'], ['Latest occurrence', '2m ago']], activity: 'Error trail', entries: [['checkout_opened', '/checkout · web', '14:32:01'], ['payment_submitted', 'POST /v1/charge', '14:32:05'], ['payment_failed', 'Request returned 500', '14:32:06'], ['exception_captured', 'CheckoutError · stack trace', '14:32:06']] },
  { key: 'performance', label: 'Monitor performance', title: 'API performance', description: 'Understand request timing and investigate slow endpoints.', chart: 'P95 request latency', unit: 'milliseconds', ticks: ['600ms', '400ms', '200ms', '0'], values: [34, 27, 39, 55, 43, 32, 27, 35, 29, 32], stats: [['Requests', '128K'], ['P95 latency', '320 ms'], ['Error rate', '0.8%'], ['Endpoints', '18']], activity: 'Recent requests', entries: [['GET /v1/products', '200 · 128 ms', '2m ago'], ['POST /v1/charge', '500 · 842 ms', '4m ago'], ['GET /v1/users', '200 · 96 ms', '6m ago'], ['POST /v1/events', '202 · 42 ms', '8m ago']] },
] as const;

export function LandingProductOverview() {
  const [selected, setSelected] = useState(0);
  const view = views[selected];
  const points = view.values.map((value, index) => `${40 + index * 48},${210 - value * 2.8}`).join(' ');

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % views.length;
    else if (event.key === 'ArrowLeft') next = (index + views.length - 1) % views.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = views.length - 1;
    else return;
    event.preventDefault();
    setSelected(next);
    document.getElementById(`product-tab-${views[next].key}`)?.focus();
  }

  return (
    <section className={`${styles.container} ${styles.product}`} id="product" aria-labelledby="product-heading">
      <h2 id="product-heading">See the story behind every event.</h2>
      <div className={styles.tabs} role="tablist" aria-label="Explore TraceIQ capabilities">
        {views.map((tab, index) => <button key={tab.key} id={`product-tab-${tab.key}`} type="button" role="tab" aria-selected={selected === index} aria-controls="product-panel" tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => onTabKeyDown(event, index)}>{tab.label}</button>)}
      </div>
      <div id="product-panel" className={styles.preview} role="tabpanel" aria-labelledby={`product-tab-${view.key}`} tabIndex={0}>
        <aside className={styles.previewSidebar} aria-hidden="true">
          <span className={styles.previewBrand}>TraceIQ</span>
          {[[House, 'Overview'], [BarChart3, 'Events'], [Layers, 'Funnels'], [CircleAlert, 'Errors'], [Activity, 'Performance']].map(([Icon, label], index) => {
            const Glyph = Icon as typeof House;
            return <div key={String(label)} className={(selected === 0 ? index === 0 : selected === 1 ? index === 3 : index === 4) ? styles.sidebarSelected : ''}><Glyph size={16} />{String(label)}</div>;
          })}
        </aside>
        <div className={styles.previewBody}>
          <div className={styles.previewTop}><span>Workspace / {view.title}</span><span className={styles.sampleLabel}><Info size={12} aria-hidden="true" /> Illustrative data</span></div>
          <div className={styles.previewContent}>
            <div className={styles.previewHeading}><div><h3>{view.title}</h3><p>{view.description}</p></div><span className={styles.dateLabel}><CalendarDays size={14} aria-hidden="true" />Last 7 days</span></div>
            <dl className={styles.stats}>{view.stats.map(([label, value], index) => <div key={label}><dt>{label}</dt><dd>{value}<svg viewBox="0 0 70 26" className={index === 2 ? styles.orangeStroke : index === 1 || index === 3 ? styles.greenStroke : styles.blueStroke} aria-hidden="true"><polyline points="1,23 10,17 20,19 31,9 42,14 54,6 68,2" fill="none" strokeWidth="1.6" /></svg></dd></div>)}</dl>
            <div className={styles.previewGrid}>
              <div className={styles.chart}><div className={styles.chartHeader}><h4>{view.chart}</h4><span>Apr 7 – Apr 13</span></div>
                <svg viewBox="0 0 510 250" role="img" aria-label={`Illustrative ${view.chart.toLowerCase()} chart in ${view.unit}; sample data only.`}>
                  <defs><linearGradient id="traceiq-preview-fill" x1="0" y1="0" x2="0" y2="1"><stop className={styles.chartStop} offset="0%" stopOpacity="0.13" /><stop className={styles.chartStop} offset="100%" stopOpacity="0.01" /></linearGradient></defs>
                  {[42, 98, 154, 210].map((y, index) => <g key={y}><line x1="40" x2="486" y1={y} y2={y} className={styles.gridStroke} /><text x="0" y={y + 4} className={styles.chartLabel}>{view.ticks[index]}</text></g>)}
                  {[40, 112, 184, 256, 328, 400, 472].map((x, index) => <g key={x}><line x1={x} x2={x} y1="42" y2="210" className={styles.gridStroke} /><text x={x} y="237" textAnchor="middle" className={styles.chartLabel}>Apr {7 + index}</text></g>)}
                  <polygon points={`40,210 ${points} 472,210`} fill="url(#traceiq-preview-fill)" />
                  <polyline points={points} className={styles.blueStroke} fill="none" strokeWidth="2" strokeLinejoin="round" />
                  {view.values.map((value, index) => <circle key={index} cx={40 + index * 48} cy={210 - value * 2.8} r="3" className={styles.blueFill} />)}
                </svg>
              </div>
              <div className={styles.activity}><h4>{view.activity}</h4><ul>{view.entries.map(([name, detail, time], index) => <li key={name}><span className={`${styles.eventDot} ${index === 1 ? styles.orangeFill : index === 3 ? styles.greenFill : styles.blueFill}`} aria-hidden="true" /><div><strong>{name}</strong><span>{detail}</span></div><time>{time}</time></li>)}</ul></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
