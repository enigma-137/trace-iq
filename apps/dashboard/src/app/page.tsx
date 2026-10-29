"use client";

import { LandingAiSection } from "@/components/landing/LandingAiSection";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingProductOverview } from "@/components/landing/LandingProductOverview";
import { LandingSignalPath } from "@/components/landing/LandingSignalPath";
import { LandingSiteChrome } from "@/components/landing/LandingSiteChrome";
import styles from "./landing-light.module.css";

const steps = [
  [
    "Connect your SDK",
    "Add TraceIQ to your stack and configure the events you want to capture.",
  ],
  [
    "Collect events",
    "Bring user activity, errors, and performance data into one place.",
  ],
  [
    "Investigate",
    "Follow the story from a user action to the system behavior behind it.",
  ],
];

export default function Page() {
  return (
    <LandingSiteChrome>
      <LandingHero />
      <LandingProductOverview />
      <LandingSignalPath />
      <LandingAiSection />
      <section
        className={`${styles.frame} ${styles.setup}`}
        aria-label="Get started with TraceIQ"
      >
        <ol>
          {steps.map(([title, description], index) => (
            <li key={title}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </LandingSiteChrome>
  );
}
