import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import landing from "@/app/landing-light.module.css";
import { LandingAskDemo } from "@/components/landing/LandingAskDemo";
import { LandingMcpDemo } from "@/components/landing/LandingMcpDemo";
import { LandingSiteChrome } from "@/components/landing/LandingSiteChrome";
import { FeatureCard } from "@/components/landing/FeatureCard";
import { features, getFeature } from "@/components/landing/features";
import styles from "@/components/landing/landing-ai-demos.module.css";

export function generateStaticParams() {
  return features.map((feature) => ({ slug: feature.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const feature = getFeature(params.slug);
  if (!feature) return {};
  const title = feature.name;
  return { title, description: feature.lead, openGraph: { title, description: feature.lead } };
}

const demos: Record<string, () => JSX.Element> = {
  "ask-traceiq": LandingAskDemo,
  "mcp-server": LandingMcpDemo,
};

export default function FeaturePage({ params }: { params: { slug: string } }) {
  const feature = getFeature(params.slug);
  if (!feature) notFound();
  const Demo = demos[feature.slug];
  const related = feature.related.flatMap((slug) => getFeature(slug) ?? []);

  return (
    <LandingSiteChrome>
      <section className={`${landing.frame} ${styles.featureHero}`} aria-labelledby="feature-heading">
        <p className={styles.featureCrumbs}>
          <a href="/features">Features</a>
          <span aria-hidden="true">/</span>
          <span>{feature.name}</span>
          {feature.status === "soon" && <span className={styles.soon}>In development</span>}
        </p>
        <h1 id="feature-heading">
          {feature.headline[0]} <span>{feature.headline[1]}</span>
        </h1>
        <p>{feature.lead}</p>
        <div className={styles.featureActions}>
          <a className={landing.button} href="/auth/login?mode=signup">
            {feature.status === "soon" ? "Get notified" : "Get started free"}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
          <a className={landing.heroSecondary} href={feature.docsHref}>
            Read the docs
          </a>
        </div>
        <p className={styles.featureNote}>Free up to 50,000 events a month, or self-host with no limits.</p>
      </section>

      {Demo && (
        <section className={`${landing.frame} ${styles.featureDemo}`} aria-label={`${feature.name} demo`}>
          <Demo />
        </section>
      )}

      <section className={`${landing.frame} ${styles.highlights}`} aria-label="Highlights">
        {feature.highlights.map((highlight, index) => (
          <div key={highlight.title}>
            <span>0{index + 1}</span>
            <h3>{highlight.title}</h3>
            <p>{highlight.text}</p>
          </div>
        ))}
      </section>

      <section className={`${landing.frame} ${styles.featureFaq}`} aria-labelledby="faq-heading">
        <h2 id="faq-heading">Questions</h2>
        <dl>
          {feature.faq.map((item) => (
            <div key={item.q}>
              <dt>{item.q}</dt>
              <dd>{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${landing.frame} ${styles.related}`} aria-labelledby="related-heading">
        <h2 id="related-heading" className={styles.relatedHeading}>
          Works with
        </h2>
        <div className={styles.featureGrid}>
          {related.map((item) => (
            <FeatureCard key={item.slug} feature={item} />
          ))}
        </div>
      </section>
    </LandingSiteChrome>
  );
}
