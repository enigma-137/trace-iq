import { HugeiconsIcon } from "@hugeicons/react";
import type { Feature } from "./features";
import styles from "./landing-ai-demos.module.css";

export function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <a className={styles.featureCard} href={`/features/${feature.slug}`}>
      <span className={styles.featureCardIcon}>
        <HugeiconsIcon icon={feature.icon} size={24} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <strong>
        {feature.name}
        {feature.status === "soon" && <em>Soon</em>}
      </strong>
      <p>{feature.summary}</p>
    </a>
  );
}
