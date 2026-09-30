export interface FeatureSpotlight {
  id: string;
  featureKey: string;
  title: string;
  tagline?: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  ctaLabel: string;
  href: string;
  priority: number;
}

export const FEATURE_SPOTLIGHTS: FeatureSpotlight[] = [
  {
    id: 'spotlight-analytics',
    featureKey: 'analytics',
    tagline: 'Web Analytics',
    title: 'See what users actually do',
    description: 'Track product activity, real-time trends, page journeys, and user behavior in one place.',
    imageSrc: '/dashboards/analytics.png',
    imageAlt: 'TraceIQ Web Analytics Companion',
    ctaLabel: 'Explore Analytics',
    href: '/dashboard/web',
    priority: 1
  },
  {
    id: 'spotlight-funnels',
    featureKey: 'funnels',
    tagline: 'Conversion Funnels',
    title: 'Find where users drop off',
    description: 'See how people move through key onboarding flows and identify exactly where conversion breaks.',
    imageSrc: '/dashboards/funnel.png',
    imageAlt: 'TraceIQ Funnels Companion',
    ctaLabel: 'Open Funnels',
    href: '/dashboard/funnels',
    priority: 2
  },
  {
    id: 'spotlight-insights',
    featureKey: 'insights',
    tagline: 'Product Insights',
    title: 'Turn data into answers',
    description: 'Discover trends, multi-event breakdowns, and important product usage signals faster.',
    imageSrc: '/dashboards/banner-insights.png',
    imageAlt: 'TraceIQ Insights Companion',
    ctaLabel: 'View Insights',
    href: '/dashboard/insights',
    priority: 3
  },
  {
    id: 'spotlight-replay',
    featureKey: 'replays',
    tagline: 'Session Replay',
    title: 'Watch the journey unfold',
    description: 'Replay user sessions step-by-step with DOM events, clicks, network calls, and mobile replays.',
    imageSrc: '/dashboards/performance.png',
    imageAlt: 'TraceIQ Session Replay Companion',
    ctaLabel: 'Open Session Replay',
    href: '/dashboard/replays',
    priority: 4
  },
  {
    id: 'spotlight-dashboards',
    featureKey: 'dashboards',
    tagline: 'Custom Dashboards',
    title: 'Build a view that matters',
    description: 'Create custom dashboard grids from charts, events, funnels, and key product signals.',
    imageSrc: '/dashboards/banner-create-dashboard.png',
    imageAlt: 'TraceIQ Dashboards Companion',
    ctaLabel: 'Open Dashboards',
    href: '/dashboard/dashboards',
    priority: 5
  },
  {
    id: 'spotlight-events',
    featureKey: 'events',
    tagline: 'Live Events',
    title: 'Understand every event',
    description: 'Inspect product activity in real time, trace event payloads, and debug incoming traffic.',
    imageSrc: '/dashboards/no-events.png',
    imageAlt: 'TraceIQ Events Stream Companion',
    ctaLabel: 'View Events',
    href: '/dashboard/events',
    priority: 6
  },
  {
    id: 'spotlight-experiments',
    featureKey: 'experiments',
    tagline: 'A/B Testing',
    title: 'Run real product experiments',
    description: 'Test variants, allocate traffic, and measure conversion lift with two-proportion statistical confidence.',
    imageSrc: '/dashboards/banner-feature-release.png',
    imageAlt: 'TraceIQ Experiments Companion',
    ctaLabel: 'Explore Experiments',
    href: '/dashboard/experiments',
    priority: 7
  },
  {
    id: 'spotlight-surveys',
    featureKey: 'surveys',
    tagline: 'In-App Feedback',
    title: 'Gather direct user feedback',
    description: 'Launch targeted in-app surveys, NPS prompts, rating scales, and open questions effortlessly.',
    imageSrc: '/dashboards/users.png',
    imageAlt: 'TraceIQ Surveys Companion',
    ctaLabel: 'Open Surveys',
    href: '/dashboard/surveys',
    priority: 8
  }
];
