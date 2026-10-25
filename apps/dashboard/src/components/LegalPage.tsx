import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import landing from '@/app/landing-light.module.css';
import blog from '@/app/blog/blog.module.css';
import styles from '@/app/legal.module.css';

type Highlight = { title: string; text: string; tone: 'blue' | 'green' | 'orange' };

/** Terms and Privacy: landing-site chrome, a ruled header, a sticky contents list and the policy text. */
export function LegalPage({
  label,
  title,
  intro,
  meta,
  highlights,
  sections,
  children
}: {
  label: string;
  title: string;
  intro: ReactNode;
  meta: string[];
  highlights: Highlight[];
  sections: Array<{ id: string; title: string }>;
  children: ReactNode;
}) {
  return (
    <LandingSiteChrome>
      <header className={`${landing.frame} ${styles.header}`}>
        <Link href="/" className={blog.backLink}>
          <ArrowLeft size={13} aria-hidden="true" /> Back to home
        </Link>
        <div className={styles.headingRow}>
          <h1>{title}</h1>
          <p className={styles.kicker}>{label}</p>
        </div>
        <p className={styles.intro}>{intro}</p>
        <ul className={styles.meta}>
          {meta.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </header>

      <ul className={`${landing.frame} ${styles.highlights}`}>
        {highlights.map((item) => (
          <li key={item.title}>
            <h2 className={styles[item.tone]}>{item.title}</h2>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>

      <div className={`${landing.frame} ${styles.layout}`}>
        <nav className={styles.contents} aria-label="On this page">
          <h2>On this page</h2>
          <ol>
            {sections.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.title}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className={`${blog.prose} ${styles.body}`}>{children}</article>
      </div>
    </LandingSiteChrome>
  );
}
