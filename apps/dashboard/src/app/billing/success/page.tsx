import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import landing from '../../landing-light.module.css';
import styles from './success.module.css';
import { SuccessHero } from './SuccessHero';

export const metadata: Metadata = {
  title: 'Welcome to TraceIQ Pro',
  description: 'Your TraceIQ Pro subscription is ready. Review your benefits and finish setup.'
};

// Mirrors CLOUD_PLAN_CATALOG.pro.limits in the API.
const limits = [
  { value: '1M', label: 'events every month' },
  { value: '10', label: 'projects' },
  { value: '5', label: 'team members' },
  { value: '365', label: 'days of data retention' },
  { value: '100', label: 'Ask TraceIQ investigations a month' }
];

export default function BillingSuccessPage({
  searchParams
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const projectId = firstParam(searchParams.projectId);
  const checkoutId = firstParam(searchParams.checkout_id);
  const withProject = (path: string) => projectId ? `${path}?projectId=${encodeURIComponent(projectId)}` : path;
  const steps = [
    { title: 'Confirm your SDK setup', body: 'Check that production events are arriving in the right project.', href: '/docs?page=quickstart', cta: 'Open the quickstart' },
    { title: 'Invite your team', body: 'Add up to five members and give each the right role.', href: withProject('/dashboard/settings/team'), cta: 'Manage team' },
    { title: 'Build your core views', body: 'Create funnels, retention reports, alerts and public dashboards.', href: withProject('/dashboard/funnels'), cta: 'Create a funnel' },
    { title: 'Ask TraceIQ', body: 'Summarize patterns and investigate the journeys that matter.', href: withProject('/dashboard'), cta: 'Open the dashboard' }
  ];

  return (
    <LandingSiteChrome cta={{ label: 'Go to dashboard', href: withProject('/dashboard') }}>
      <SuccessHero projectId={projectId} checkoutId={checkoutId} />

      <section className={`${landing.frame} ${styles.limits}`} aria-labelledby="limits-title">
        <div className={styles.sectionHeading}>
          <h2 id="limits-title">More room to understand your product.</h2>
          <p>Pro limits / per organization</p>
        </div>
        <ul>
          {limits.map((limit) => (
            <li key={limit.label}>
              <strong>{limit.value}</strong>
              <span>{limit.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${landing.frame} ${styles.steps}`} aria-labelledby="steps-title">
        <h2 id="steps-title">Getting started with Pro</h2>
        <ol>
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <a href={step.href}>
                {step.cta} <ArrowRight size={13} aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
      </section>

      <div className={`${landing.frame} ${styles.help}`}>
        <div>
          <h2>Need help with setup?</h2>
          <p>Email us with the project you are configuring and we’ll help you get Pro running.</p>
        </div>
        <a href="mailto:traceiq.run@gmail.com?subject=TraceIQ%20Pro%20setup%20help">traceiq.run@gmail.com</a>
      </div>
    </LandingSiteChrome>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
