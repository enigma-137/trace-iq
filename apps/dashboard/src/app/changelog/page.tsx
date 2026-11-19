import type { Metadata } from 'next';
import { ArrowRight, Rss } from 'lucide-react';
import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import { formatEntryDate, formatMonth } from '@/lib/changelog';
import landing from '../landing-light.module.css';
import blog from '../blog/blog.module.css';
import styles from './changelog.module.css';
import { entries, type LoadedEntry } from './entries';
import { MarkSeen } from './MarkSeen';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'New features, improvements and fixes in TraceIQ, newest first.',
  alternates: { types: { 'application/rss+xml': [{ url: '/changelog/rss.xml', title: 'TraceIQ Changelog' }] } }
};

/** Entries grouped by month, keeping the newest-first order. */
function byMonth(list: LoadedEntry[]) {
  const groups: { month: string; items: LoadedEntry[] }[] = [];
  for (const entry of list) {
    const month = formatMonth(entry.date);
    if (groups[groups.length - 1]?.month !== month) groups.push({ month, items: [] });
    groups[groups.length - 1].items.push(entry);
  }
  return groups;
}

export default function ChangelogPage() {
  return (
    <LandingSiteChrome>
      <section className={`${landing.frame} ${styles.intro}`} aria-labelledby="changelog-title">
        <p className={styles.kicker}>Changelog</p>
        <h1 id="changelog-title">
          What&rsquo;s new in <span>TraceIQ.</span>
        </h1>
        <p className={styles.lede}>New features, improvements and fixes, newest first.</p>
        <div className={styles.links}>
          <a className={styles.cta} href="/auth/login?mode=signup">
            Try the latest <ArrowRight size={14} aria-hidden="true" />
          </a>
          <a className={styles.cta} href="/changelog/rss.xml">
            <Rss size={13} aria-hidden="true" /> RSS feed
          </a>
        </div>
        <MarkSeen slug={entries[0]?.slug} />
      </section>

      <div className={`${landing.frame} ${styles.timeline}`}>
        {byMonth(entries).map((group) => (
          <section key={group.month} aria-label={group.month}>
            <h2 className={styles.month}>{group.month}</h2>
            {group.items.map(({ slug, title, date, areas, Body }) => (
              <article key={slug} id={slug} className={styles.entry}>
                <div className={styles.when}>
                  <time dateTime={date}>{formatEntryDate(date)}</time>
                </div>
                <div className={styles.content}>
                  <div className={styles.areas}>
                    {areas.map((area) => (
                      <span key={area} className={area === 'Fixes' ? styles.areaFix : styles.area}>
                        {area}
                      </span>
                    ))}
                  </div>
                  <h3>
                    <a href={`#${slug}`} className={styles.anchor}>
                      {title}
                    </a>
                  </h3>
                  <div className={`${blog.prose} ${styles.body}`}>
                    <Body />
                  </div>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </LandingSiteChrome>
  );
}
