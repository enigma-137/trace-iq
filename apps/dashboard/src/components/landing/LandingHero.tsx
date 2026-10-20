import { ArrowRight } from 'lucide-react';
import styles from '@/app/landing-light.module.css';

export function LandingHero() {
  return (
    <section className={styles.hero} aria-labelledby="hero-heading">
      <div className={`${styles.container} ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <h1 id="hero-heading">Product analytics<br className={styles.desktopBreak} /> and observability,<br className={styles.desktopBreak} /> connected.</h1>
          <p>Understand user behavior. Investigate errors.<br className={styles.desktopBreak} /> See the full picture.</p>
          <a className={styles.button} href="/auth/login">Explore TraceIQ <ArrowRight size={18} aria-hidden="true" /></a>
        </div>
        <svg className={styles.traceArt} viewBox="0 0 540 340" role="img" aria-labelledby="trace-title trace-description">
          <title id="trace-title">A complete product story</title>
          <desc id="trace-description">User events, traces and errors, and performance metrics connect in TraceIQ.</desc>
          <g fill="none" strokeWidth="1.6">
            <path className={styles.blueStroke} d="M30 50 H100 C155 50 140 123 205 135 S255 166 290 170" />
            <path className={styles.greenStroke} d="M30 170 H100 C145 170 150 201 190 201 S253 170 290 170" />
            <path className={styles.orangeStroke} d="M30 290 H100 C185 290 177 235 225 213 S261 170 290 170" />
            <g className={styles.mutedStroke} strokeDasharray="2 5"><path d="M325 170 C420 170 399 45 510 45" /><path d="M325 170 C420 170 419 120 510 120" /><path d="M325 170 C420 170 425 220 510 220" /><path d="M325 170 C420 170 419 295 510 295" /></g>
          </g>
          <g className={styles.blueFill}><circle cx="30" cy="50" r="9" /><circle cx="130" cy="61" r="4" /><circle cx="210" cy="136" r="4" /><circle cx="510" cy="45" r="7" /></g>
          <g className={styles.greenFill}><rect x="21" y="161" width="18" height="18" /><circle cx="100" cy="170" r="4" /><circle cx="190" cy="201" r="4" /><rect x="503" y="113" width="14" height="14" /></g>
          <g className={styles.orangeFill}><path d="M30 280 L39 296 H21 Z" /><circle cx="100" cy="290" r="4" /><circle cx="217" cy="217" r="4" /><path d="M510 212 L518 227 H502 Z" /></g>
          <g className={styles.mutedFill}><circle cx="410" cy="111" r="3" /><circle cx="418" cy="199" r="3" /><circle cx="510" cy="295" r="3" /></g>
          <rect className={styles.traceHub} x="275" y="137" width="70" height="66" rx="10" />
          <g className={styles.blueFill}><path d="m310 151 17 10-17 10-17-10z" /><path d="m293 169 17 10 17-10v5l-17 10-17-10z" /><path d="m293 181 17 10 17-10v5l-17 10-17-10z" /></g>
          <g className={styles.artLabels}><text x="22" y="79">User events</text><text x="22" y="198">Traces and errors</text><text x="22" y="320">Performance metrics</text><text x="310" y="229" textAnchor="middle">A complete</text><text x="310" y="246" textAnchor="middle">product story</text></g>
        </svg>
      </div>
    </section>
  );
}
