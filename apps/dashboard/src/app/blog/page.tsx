import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import { formatPostDate, type BlogPost } from '@/lib/blog';
import landing from '../landing-light.module.css';
import styles from './blog.module.css';
import { posts } from './posts';

export const metadata: Metadata = { title: 'Blog', description: 'Notes on self-hosted analytics, product telemetry, privacy and building TraceIQ.' };

function PostMeta({ post }: { post: BlogPost }) {
  return (
    <div className={styles.meta}>
      <span className={styles.tag}>{post.tag}</span>
      <time dateTime={post.date}>{formatPostDate(post.date)}</time>
      <span>{post.readTime}</span>
    </div>
  );
}

export default function BlogPage() {
  const [latest, ...rest] = posts;
  return (
    <LandingSiteChrome>
      <section className={`${landing.frame} ${styles.intro}`} aria-labelledby="blog-title">
        <div className={styles.introHeading}>
          <h1 id="blog-title">
            Building analytics <span>in the open.</span>
          </h1>
          <p className={styles.kicker}>TraceIQ journal / {posts.length} posts</p>
        </div>
        <p className={styles.lede}>
          Engineering notes, product decisions and clear-eyed comparisons for teams deciding how to understand their users.
        </p>
      </section>

      <section className={`${landing.frame} ${styles.posts}`} aria-label="Posts">
        {latest && (
          <Link href={`/blog/${latest.slug}`} className={styles.featured}>
            <div>
              <p className={styles.featuredLabel}>Latest</p>
              <PostMeta post={latest} />
              <h2>{latest.title}</h2>
            </div>
            <div className={styles.featuredAside}>
              <p>{latest.description}</p>
              <span className={styles.readLink}>
                Read the post <ArrowRight size={14} aria-hidden="true" />
              </span>
            </div>
          </Link>
        )}
        {rest.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className={styles.row}>
            <PostMeta post={post} />
            <div>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
            </div>
            <ArrowUpRight size={20} className={styles.rowArrow} aria-hidden="true" />
          </Link>
        ))}
      </section>
    </LandingSiteChrome>
  );
}
