'use client';

import { useEffect, useRef, useState } from 'react';

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
      className="relative w-full bg-[#f3f2ee] text-[#111111] select-none"
      style={{ height: '420vh' }}
      aria-label="Core capabilities scroll presentation"
    >
      {/* Sticky Fullscreen Canvas */}
      <div className="sticky top-0 z-20 h-screen w-full bg-[#f3f2ee] flex flex-col justify-between p-8 sm:p-14 lg:p-20 xl:p-24 overflow-hidden">
        {/* Top Header Row */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <span className="text-sm sm:text-base font-normal text-[#555555] tracking-tight transition-colors duration-200">
              {currentSlide.eyebrow}
            </span>
            <span className="text-xs font-mono text-[#888888] px-2.5 py-0.5 rounded-full border border-[#dedcd4] bg-[#eae8e1] transition-all duration-200">
              {currentSlide.tag}
            </span>
          </div>

          <div className="font-mono text-xs sm:text-sm text-[#777777] tracking-wider">
            <strong className="text-[#111111] font-semibold">{currentSlide.number}</strong>
            <span className="mx-1 text-[#aaaaaa]">/</span>
            <span>06</span>
          </div>
        </div>

        {/* Center Editorial Statement */}
        <div className="relative my-auto max-w-6xl w-full py-8">
          <div
            key={currentSlide.number}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full"
          >
            <h2 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-[#111111] leading-[1.22] sm:leading-[1.18]">
              {currentSlide.textPrefix}
              <span className="text-[#777777] font-medium">{currentSlide.highlightText}</span>
            </h2>
          </div>
        </div>

        {/* Bottom Step Indicator Bar */}
        <div className="flex items-center justify-between w-full pt-6 border-t border-[#dedcd4]">
          <div className="flex items-center gap-2 sm:gap-3">
            {CAPABILITIES.map((slide, i) => (
              <button
                key={slide.number}
                type="button"
                onClick={() => handleStepClick(i)}
                className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                  i === activeIndex
                    ? 'w-10 sm:w-16 bg-[#111111]'
                    : 'w-4 sm:w-6 bg-[#d4d2c8] hover:bg-[#b0ae9f]'
                }`}
                aria-label={`Go to slide ${i + 1}: ${slide.tag}`}
              />
            ))}
          </div>

          <div className="text-[11px] sm:text-xs font-mono text-[#777777] uppercase tracking-widest">
            Scroll to explore ({activeIndex + 1} of 6)
          </div>
        </div>
      </div>
    </section>
  );
}
