'use client';

import { Fragment, useState } from 'react';
import landing from '../landing-light.module.css';
import styles from './pricing.module.css';
import {
  PRO_PRICE,
  PRO_YEARLY_PER_MONTH_USD,
  PRO_YEARLY_SAVINGS_PERCENT,
  formatUsd,
  type BillingInterval
} from '@/lib/pricing';

type Cell = string | boolean;

interface ComparisonRow {
  name: string;
  selfHosted: Cell;
  free: Cell;
  pro: Cell;
}

// Cloud values mirror CLOUD_PLAN_CATALOG and the entitlement checks in the API.
const COMPARISON: { category: string; rows: ComparisonRow[] }[] = [
  {
    category: 'Limits',
    rows: [
      { name: 'Events per month', selfHosted: 'Unlimited', free: '50,000', pro: '1,000,000' },
      { name: 'Projects', selfHosted: 'Unlimited', free: '1', pro: '10' },
      { name: 'Team members', selfHosted: 'Unlimited', free: '1', pro: '5' },
      { name: 'Data retention', selfHosted: 'You decide', free: '30 days', pro: '365 days' },
      { name: 'Ask TraceIQ investigations', selfHosted: 'Your own AI key', free: '3 per month', pro: '100 per month' }
    ]
  },
  {
    category: 'Product',
    rows: [
      { name: 'Events, funnels, retention and cohorts', selfHosted: true, free: true, pro: true },
      { name: 'Feature flags and experiments', selfHosted: true, free: true, pro: true },
      { name: 'Public dashboards', selfHosted: true, free: true, pro: true },
      { name: 'Session replay', selfHosted: true, free: false, pro: true },
      { name: 'Alerts', selfHosted: true, free: false, pro: true }
    ]
  },
  {
    category: 'Operations',
    rows: [
      { name: 'Hosting', selfHosted: 'Your infrastructure', free: 'Managed by TraceIQ', pro: 'Managed by TraceIQ' },
      { name: 'Upgrades and backups', selfHosted: 'You run them', free: 'Included', pro: 'Included' },
      { name: 'Support', selfHosted: 'Community', free: 'Community', pro: 'Email' }
    ]
  }
];

const FAQS = [
  {
    question: 'How does yearly billing work?',
    answer: `Yearly Cloud Pro is billed once at ${formatUsd(PRO_PRICE.yearlyUsd)} per year, which works out to ${formatUsd(PRO_YEARLY_PER_MONTH_USD)} per month. That is ${formatUsd(PRO_PRICE.monthlyUsd * 12 - PRO_PRICE.yearlyUsd)} less than paying monthly for twelve months, or two months free. Monthly and yearly Pro include exactly the same limits and features.`
  },
  {
    question: 'Can I switch from monthly to yearly?',
    answer: 'Yes. From Settings → Billing, choose “Switch to yearly at renewal”. Your monthly plan stays active until the end of the current period, then renews as yearly. You are never charged twice for the same period.'
  },
  {
    question: 'What happens if I go over my event allowance?',
    answer: 'We warn you at 70%, 90% and 100% of your monthly events. A 5% buffer keeps ingestion running past the limit; at 105% new events pause until the next month or until you upgrade. Existing data is never deleted for going over.'
  },
  {
    question: 'How do cancellations and failed payments work?',
    answer: 'Cancel any time from the billing portal. Pro stays active until the end of the period you already paid for, then the organization moves to Cloud Free. If a renewal payment fails, Pro stays active for a 7-day grace period while you update your payment method.'
  },
  {
    question: 'Is self-hosted TraceIQ really free?',
    answer: 'Yes. Self-hosted TraceIQ is open source and unrestricted. You run the infrastructure and can bring your own AI provider key for Ask TraceIQ. The same SDKs work with self-hosted and Cloud.'
  },
  {
    question: 'Do you offer custom plans?',
    answer: 'For higher volumes, longer retention or custom contracts, email traceiq.run@gmail.com and we will put together a plan with you.'
  }
];

export function PricingClientView() {
  const [interval, setBillingInterval] = useState<BillingInterval>('monthly');
  const yearly = interval === 'yearly';
  const proAmount = yearly ? PRO_YEARLY_PER_MONTH_USD : PRO_PRICE.monthlyUsd;

  return (
    <>
      <section className={`${landing.frame} ${styles.intro}`} aria-labelledby="pricing-title">
        <div className={styles.introHeading}>
          <h1 id="pricing-title">Simple pricing for every stage.</h1>
          <p className={styles.kicker}>Pricing / USD</p>
        </div>
        <p className={styles.lede}>
          Self-host TraceIQ for free, start on Cloud Free, or move to Cloud Pro when your product needs more room.
        </p>

        <div className={styles.toggleRow}>
          <div className={styles.toggle} role="group" aria-label="Billing interval">
            <button type="button" aria-pressed={!yearly} onClick={() => setBillingInterval('monthly')}>
              Monthly
            </button>
            <button type="button" aria-pressed={yearly} onClick={() => setBillingInterval('yearly')}>
              Yearly
            </button>
          </div>
          <p className={styles.saving}>Yearly: save {PRO_YEARLY_SAVINGS_PERCENT}%, 2 months free</p>
        </div>
      </section>

      <section className={`${landing.frame} ${styles.plans}`} aria-label="Plans">
        <article className={styles.plan}>
          <h2>Self-hosted</h2>
          <p className={styles.planSummary}>Open source on your own infrastructure, with no limits.</p>
          <p className={styles.price}>
            <span className={styles.amount}>$0</span>
            <span className={styles.unit}>forever</span>
          </p>
          <p className={styles.billingNote}>You provide the servers.</p>
          <a className={`${landing.button} ${styles.secondaryButton}`} href="/docs">
            Read the self-hosting docs
          </a>
          <ul className={styles.features}>
            <li>Unlimited events, projects and members</li>
            <li>Session replay and alerts</li>
            <li>Bring your own AI key</li>
            <li>Community support</li>
          </ul>
        </article>

        <article className={styles.plan}>
          <h2>Cloud Free</h2>
          <p className={styles.planSummary}>Managed TraceIQ for evaluating and small projects.</p>
          <p className={styles.price}>
            <span className={styles.amount}>$0</span>
            <span className={styles.unit}>/month</span>
          </p>
          <p className={styles.billingNote}>No card required.</p>
          <a className={`${landing.button} ${styles.secondaryButton}`} href="/auth/login">
            Start for free
          </a>
          <ul className={styles.features}>
            <li>50,000 events per month</li>
            <li>1 project and 1 member</li>
            <li>30-day retention</li>
            <li>3 Ask TraceIQ investigations per month</li>
          </ul>
        </article>

        <article className={`${styles.plan} ${styles.featured}`} aria-labelledby="pro-plan-title">
          <h2 id="pro-plan-title">Cloud Pro</h2>
          <p className={styles.planSummary}>Higher limits, replay and alerts for growing products.</p>
          <p className={styles.price} aria-live="polite">
            <span className={styles.amount}>{formatUsd(proAmount)}</span>
            <span className={styles.unit}>/month</span>
          </p>
          <p className={styles.billingNote}>
            {yearly ? `${formatUsd(PRO_PRICE.yearlyUsd)} billed annually` : 'Billed monthly'}
          </p>
          <a className={landing.button} href={`/dashboard/settings/billing?checkout=${interval}`}>
            {yearly ? `Get Pro yearly, ${formatUsd(PRO_PRICE.yearlyUsd)}/year` : `Get Pro monthly, ${formatUsd(PRO_PRICE.monthlyUsd)}/month`}
          </a>
          <ul className={styles.features}>
            <li>1,000,000 events per month</li>
            <li>10 projects and 5 members</li>
            <li>365-day retention</li>
            <li>100 Ask TraceIQ investigations per month</li>
            <li>Session replay and alerts</li>
          </ul>
        </article>
      </section>

      <div className={`${landing.frame} ${styles.custom}`}>
        <p>
          Need higher volumes or a custom contract?{' '}
          <a href="mailto:traceiq.run@gmail.com?subject=TraceIQ%20custom%20plan">Talk to us</a>.
        </p>
      </div>

      <section className={`${landing.frame} ${styles.compare}`} aria-labelledby="compare-title">
        <h2 id="compare-title">Compare plans</h2>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Feature</th>
                <th scope="col">Self-hosted</th>
                <th scope="col">Cloud Free</th>
                <th scope="col">Cloud Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((group) => (
                <Fragment key={group.category}>
                  <tr className={styles.groupRow}>
                    <th scope="colgroup" colSpan={4}>{group.category}</th>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.name}>
                      <th scope="row">{row.name}</th>
                      <td><CellValue value={row.selfHosted} /></td>
                      <td><CellValue value={row.free} /></td>
                      <td><CellValue value={row.pro} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${landing.frame} ${styles.faq}`} aria-labelledby="faq-title">
        <h2 id="faq-title">Questions</h2>
        <div>
          {FAQS.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}

function CellValue({ value }: { value: Cell }) {
  if (value === true) return <>Included</>;
  if (value === false) return <span className={styles.absent}>Not included</span>;
  return <>{value}</>;
}
