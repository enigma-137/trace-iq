'use client';

import { useEffect, useRef, useState } from 'react';
import { SceneCanvas } from '@/components/webgl/SceneCanvas';

interface CapabilitySlide {
  eyebrow: string;
  tag: string;
  number: string;
  textPrefix: string;
  highlightText: string;
}

const CAPABILITIES: CapabilitySlide[] = [
  {
    eyebrow: 'For developers',
    tag: 'Web analytics',
    number: '01',
    textPrefix: 'Learn how developers use TraceIQ to observe, optimize and scale web applications, APIs and ',
    highlightText: 'telemetry pipelines.'
  },
  {
    eyebrow: 'For product teams',
    tag: 'Funnels and journeys',
    number: '02',
    textPrefix: 'Measure conversion funnels and inspect real session-to-session user pathways ',
    highlightText: 'without synthetic noise.'
  },
  {
    eyebrow: 'For growth engineers',
    tag: 'Users and cohorts',
    number: '03',
    textPrefix: 'Connect anonymous browser activity to identified user profiles with ',
    highlightText: 'chronological event timelines.'
  },
  {
    eyebrow: 'For infrastructure & SRE',
    tag: 'Errors and API health',
    number: '04',
    textPrefix: 'Pinpoint runtime exceptions, latency spikes, and failing microservices ',
    highlightText: 'before users report them.'
  },
  {
    eyebrow: 'For release safety',
    tag: 'Flags and alerts',
    number: '05',
    textPrefix: 'Roll out experimental feature flags, segment live audiences, and trigger ',
    highlightText: 'instant webhook alerts.'
  },
  {
    eyebrow: 'For open architectures',
    tag: 'Share and export',
    number: '06',
    textPrefix: 'Export raw event data to ClickHouse or PostgreSQL, and share ',
    highlightText: 'permission-scoped dashboards.'
  }
];

export function LandingScrollCapabilities() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // The WebGL cloud reads progress every frame. Keeping it in a ref means
  // scrolling drives the morph without re-rendering React on each event.
  const progressRef = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const totalScrollable = rect.height - window.innerHeight;
      if (totalScrollable <= 0) return;

      // rect.top is <= 0 when the top of the container is at or above viewport top
      const scrollProgress = -rect.top / totalScrollable;
      const clampedProgress = Math.max(0, Math.min(0.999, scrollProgress));
      progressRef.current = clampedProgress;

      const nextIndex = Math.min(
        CAPABILITIES.length - 1,
        Math.floor(clampedProgress * CAPABILITIES.length)
      );

      setActiveIndex(nextIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  const currentSlide = CAPABILITIES[activeIndex] ?? CAPABILITIES[0];

  const handleStepClick = (index: number) => {
    const el = containerRef.current;
    if (!el) return;
    const totalScrollable = el.offsetHeight - window.innerHeight;
    const targetScrollTop = el.offsetTop + (index / (CAPABILITIES.length - 1)) * totalScrollable;
    window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  };

  return (
    <section
      ref={containerRef}
      id="solutions"
      className="capability-stage"
      style={{ height: '420vh' }}
      aria-label="Core capabilities scroll presentation"
    >
      {/* Sticky Fullscreen Canvas */}
      <div className="capability-sticky">
        {/*
          One point cloud reshapes itself through all six formations as the
          visitor scrolls, so each capability visibly becomes the next.
        */}
        <SceneCanvas kind="morph" progress={progressRef} className="capability-morph" />
        <div className="capability-scrim" aria-hidden="true" />

        {/* Chapter slug, matching every other chapter on the page */}
        <div className="chapter-slug capability-slug">
          <b>03</b>
          <s />
          <span>{currentSlide.tag}</span>
          <em className="capability-count">
            <b>{currentSlide.number}</b> / 06
          </em>
        </div>

        {/* Center Editorial Statement */}
        <div className="capability-statement">
          <span className="capability-eyebrow">{currentSlide.eyebrow}</span>
          <h2 key={currentSlide.number} className="display-sm capability-copy">
            {currentSlide.textPrefix}
            <span>{currentSlide.highlightText}</span>
          </h2>
        </div>

        {/* Bottom Step Indicator Bar */}
        <div className="capability-steps">
          <div className="capability-dots">
            {CAPABILITIES.map((slide, i) => (
              <button
                key={slide.number}
                type="button"
                onClick={() => handleStepClick(i)}
                className={i === activeIndex ? 'is-active' : ''}
                aria-label={`Go to slide ${i + 1}: ${slide.tag}`}
              />
            ))}
          </div>
          <span className="capability-hint">Scroll to explore</span>
        </div>
      </div>
    </section>
  );
}
