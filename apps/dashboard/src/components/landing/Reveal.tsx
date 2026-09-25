'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Stagger, in ms, for items revealed as a group. */
  delay?: number;
  className?: string;
}

/**
 * Rises its children into place the first time they are scrolled into view.
 *
 * The class is toggled directly on the node rather than through React state so
 * a page full of these does not trigger a render per section, and the observer
 * unhooks itself once fired — reveals are a first-impression effect, not
 * something to replay on every scroll back up.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-revealed');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        window.setTimeout(() => el.classList.add('is-revealed'), delay);
        observer.disconnect();
      },
      // Fire a little before the section is fully on screen so the motion has
      // finished by the time the visitor is actually reading it.
      { threshold: 0, rootMargin: '0px 0px -12% 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`reveal${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export default Reveal;
