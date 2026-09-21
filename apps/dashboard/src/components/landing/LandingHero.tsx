'use client';

import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';

/**
 * Hero Media Configuration
 */
export const HERO_CONFIG = {
  heroVideoUrl:
    'https://res.cloudinary.com/dl0uoovgu/video/upload/v1789990762/document_5875260522122718073_dz6wst.mp4',
  heroFallbackImageUrl: '/hero-static.png',
};

interface LandingHeroProps {
  videoUrl?: string;
  fallbackImageUrl?: string;
}

export function LandingHero({
  videoUrl = HERO_CONFIG.heroVideoUrl,
  fallbackImageUrl = HERO_CONFIG.heroFallbackImageUrl,
}: LandingHeroProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // 1. Reduced-motion preference check
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(motionQuery.matches);

    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    if (motionQuery.addEventListener) {
      motionQuery.addEventListener('change', handleMotionChange);
    } else {
      motionQuery.addListener(handleMotionChange);
    }

    // 2. Guaranteed browser autoplay initialization
    const video = videoRef.current;
    if (video && !motionQuery.matches) {
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;

      const attemptPlay = () => {
        const promise = video.play();
        if (promise !== undefined) {
          promise.catch((err) => {
            console.debug('Autoplay waiting for ready/gesture:', err);
            // Fallback listener on first user touch/scroll/click to trigger play immediately
            const onUserAction = () => {
              video.play().catch(() => {});
              window.removeEventListener('click', onUserAction);
              window.removeEventListener('touchstart', onUserAction);
              window.removeEventListener('scroll', onUserAction);
            };
            window.addEventListener('click', onUserAction, { once: true, passive: true });
            window.addEventListener('touchstart', onUserAction, { once: true, passive: true });
            window.addEventListener('scroll', onUserAction, { once: true, passive: true });
          });
        }
      };

      if (video.readyState >= 2) {
        attemptPlay();
      } else {
        video.addEventListener('loadeddata', attemptPlay, { once: true });
        video.addEventListener('canplay', attemptPlay, { once: true });
      }

      attemptPlay();
    }

    return () => {
      if (motionQuery.removeEventListener) {
        motionQuery.removeEventListener('change', handleMotionChange);
      } else {
        motionQuery.removeListener(handleMotionChange);
      }
    };
  }, [videoUrl]);

  return (
    <section
      id="top"
      aria-label="TraceIQ Hero"
      className="relative w-full h-screen min-h-[600px] overflow-hidden bg-[#050505] text-zinc-100 select-none"
    >
      {/* ========================================================================= */}
      {/* 1. MEDIA LAYER (Direct Cloudinary Video with Instant Native Poster)       */}
      {/* ========================================================================= */}
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0">
        {prefersReducedMotion ? (
          <img
            src={fallbackImageUrl}
            alt="TraceIQ Telemetry and Observability Platform Visual"
            className="w-full h-full object-cover object-[68%_center] lg:object-center"
            loading="eager"
            fetchPriority="high"
          />
        ) : (
          <video
            ref={(el) => {
              if (el) {
                el.defaultMuted = true;
                el.muted = true;
              }
              videoRef.current = el;
            }}
            src={videoUrl}
            poster={fallbackImageUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            className="w-full h-full object-cover object-[68%_center] lg:object-center"
          >
            <source src={videoUrl} type="video/mp4" />
          </video>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 2. ATMOSPHERIC OVERLAYS (Soft Localized Lower-Left Text Protection)       */}
      {/* ========================================================================= */}
      {/* Top ambient dissolve behind floating navigation */}
      <div
        className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#050505]/75 via-[#050505]/25 to-transparent pointer-events-none z-10"
        aria-hidden="true"
      />

      {/* Localized lower-left atmospheric smoke/vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: `
            radial-gradient(ellipse 850px 650px at 8% 88%, rgba(5, 5, 5, 0.94) 0%, rgba(5, 5, 5, 0.72) 42%, rgba(5, 5, 5, 0.22) 75%, transparent 100%),
            linear-gradient(to right, rgba(5, 5, 5, 0.82) 0%, rgba(5, 5, 5, 0.35) 32%, transparent 68%),
            linear-gradient(to top, #050505 0%, rgba(5, 5, 5, 0.7) 6%, transparent 18%)
          `,
        }}
        aria-hidden="true"
      />

      {/* ========================================================================= */}
      {/* 3. HERO COPY LAYER (Guaranteed Absolute Inset-0 Lower-Left Anchor)         */}
      {/* ========================================================================= */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          className="absolute pointer-events-auto flex flex-col items-start text-left max-w-[calc(100vw-48px)] sm:max-w-[560px]"
          style={{
            left: 'clamp(24px, 5vw, 80px)',
            bottom: 'clamp(104px, 16vh, 128px)',
          }}
        >
          {/* Confident, compact headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-[3.75rem] font-bold tracking-tight text-white leading-[1.06]">
            Clarity for
            <br />
            <span className="font-serif italic font-normal text-zinc-300">
              complex systems.
            </span>
          </h1>

          {/* Minimal supporting line */}
          <p className="mt-4 text-sm sm:text-base text-zinc-300 font-normal leading-relaxed max-w-[36ch]">
            Product analytics and observability, connected.
          </p>

          {/* Understated text CTA */}
          <div className="mt-6 flex items-center">
            <a
              href="/auth/login"
              className="group inline-flex items-center gap-2 text-sm font-medium text-zinc-200 transition-colors duration-150 hover:text-white focus:outline-none focus:ring-1 focus:ring-zinc-400 rounded-sm"
            >
              <span>Explore TraceIQ</span>
              <HugeiconsIcon
                icon={ArrowUpRight01Icon}
                size={15}
                className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 text-zinc-400 group-hover:text-white"
              />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
