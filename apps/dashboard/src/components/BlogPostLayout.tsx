import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import { formatPostDate, type BlogPostMeta } from '@/lib/blog';
import landing from '@/app/landing-light.module.css';
import styles from '@/app/blog/blog.module.css';

export function BlogPostLayout({ title, lede, date, readTime, tag, children }: BlogPostMeta & { children: ReactNode }) {
  return (
    <LandingSiteChrome>
      <article>
        <header className={`${landing.frame} ${styles.postHeader}`}>
          <div className={styles.postHeaderInner}>
            <Link href="/blog" className={styles.backLink}>
              <ArrowLeft size={13} aria-hidden="true" /> All posts
            </Link>
            <div className={styles.meta}>
              <span className={styles.tag}>{tag}</span>
              <time dateTime={date}>{formatPostDate(date)}</time>
              <span>{readTime}</span>
            </div>
            <h1>{title}</h1>
            <p className={styles.lede}>{lede}</p>
          </div>
        </header>
        <div className={`${landing.frame} ${styles.postBody}`}>
          <aside className={styles.postAside} aria-hidden="true">
            <span />
            <div>TraceIQ journal</div>
            <div>{tag}</div>
          </aside>
          <div className={styles.prose}>{children}</div>
        </div>
        <footer className={`${landing.frame} ${styles.postFooter}`}>
          <Link href="/blog" className={styles.backLink}>
            <ArrowLeft size={13} aria-hidden="true" /> Back to all posts
          </Link>
        </footer>
      </article>
    </LandingSiteChrome>
  );
}
