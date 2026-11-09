import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

export const TOUR_DONE_KEY = 'traceiq:tour-done';

// Trace introduces the tour. Static markup only: nothing user-provided goes in here.
const welcome = `
  <div style="display:flex;align-items:center;gap:12px">
    <img src="/brand/trace/trace-wave.webp" alt="" width="64" height="64" style="flex-shrink:0" />
    <span>Hi, I am Trace. Here is a quick look around. It takes about a minute, and you can stop any time.</span>
  </div>`;

/** Every stop points at a `data-tour` attribute in the sidebar. Stops whose target is not on screen are skipped. */
const STOPS: Array<{ target: string | null; title: string; description: string; side?: 'right' | 'bottom' }> = [
  { target: null, title: 'Welcome to TraceIQ', description: welcome },
  {
    target: 'nav-overview',
    title: 'Overview',
    description: 'Your health check: events, users, errors and trends for the project at a glance.',
    side: 'right'
  },
  {
    target: 'group-analytics',
    title: 'Analytics',
    description: 'Insights, dashboards, funnels, retention and users. This is where you learn how people use your product.',
    side: 'right'
  },
  {
    target: 'group-observability',
    title: 'Observability',
    description: 'Errors, logs, API performance, alerts and replays. This is where you find what is breaking and who it hit.',
    side: 'right'
  },
  {
    target: 'group-product',
    title: 'Product',
    description: 'Feature flags, experiments and surveys, so you can ship changes and test them.',
    side: 'right'
  },
  {
    target: 'ask',
    title: 'Ask TraceIQ',
    description: 'Ask a question about your data in plain words. Press ⌘ K from anywhere.',
    side: 'right'
  },
  {
    target: 'nav-settings',
    title: 'Settings',
    description: 'Your account, security, billing and the daily brief. You can hide sidebar items with the gear next to each section.',
    side: 'right'
  }
];

export function startDashboardTour(): void {
  const steps: DriveStep[] = [];
  for (const stop of STOPS) {
    if (stop.target === null) {
      steps.push({ popover: { title: stop.title, description: stop.description } });
      continue;
    }
    const selector = `[data-tour="${stop.target}"]`;
    if (!document.querySelector(selector)) continue;
    steps.push({ element: selector, popover: { title: stop.title, description: stop.description, side: stop.side } });
  }

  const tour = driver({
    steps,
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    popoverClass: 'traceiq-tour',
    stagePadding: 6,
    popoverOffset: 16,
    stageRadius: 10,
    overlayOpacity: 0.55,
    onDestroyed: () => {
      try {
        window.localStorage.setItem(TOUR_DONE_KEY, '1');
      } catch {
        // Storage unavailable: nothing to remember.
      }
    }
  });
  tour.drive();
}
