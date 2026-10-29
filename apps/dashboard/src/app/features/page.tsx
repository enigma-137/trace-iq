import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import landing from "@/app/landing-light.module.css";
import { FeatureCard } from "@/components/landing/FeatureCard";
import { LandingSiteChrome } from "@/components/landing/LandingSiteChrome";
import { featureGroups, features } from "@/components/landing/features";
import styles from "@/components/landing/landing-ai-demos.module.css";

const description =
  "Product analytics, session replay, error tracking, API performance, flags, experiments and an AI analyst, on one user timeline.";

export const metadata: Metadata = {
  title: "Features",
  description,
  openGraph: { title: "Features", description },
};

export default function FeaturesPage() {
  return (
    <LandingSiteChrome>
      <section className={`${landing.frame} ${styles.featureHero}`} aria-labelledby="features-heading">
        <p className={styles.featureCrumbs}>Features</p>
        <h1 id="features-heading">
          Everything on <span>one user timeline.</span>
        </h1>
        <p>{description}</p>
        <div className={styles.featureActions}>
          <a className={landing.button} href="/auth/login?mode=signup">
            Get started free <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className={landing.heroSecondary} href="/pricing">
            See pricing
          </a>
        </div>
        <p className={styles.featureNote}>Free up to 50,000 events a month, or self-host with no limits.</p>
      </section>
      <section className={`${landing.frame} ${styles.related}`} aria-label="All features">
        {featureGroups.map((group) => (
          <div key={group}>
            <h2 className={styles.groupLabel}>{group}</h2>
            <div className={styles.featureGrid}>
              {features
                .filter((feature) => feature.group === group)
                .map((feature) => (
                  <FeatureCard key={feature.slug} feature={feature} />
                ))}
            </div>
          </div>
        ))}
      </section>
    </LandingSiteChrome>
  );
}
