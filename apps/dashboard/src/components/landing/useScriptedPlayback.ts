"use client";

import { useEffect, useRef, useState } from "react";

export type PlaybackScript = {
  /** Typed out character by character before the first beat. */
  prompt: string;
  /** Delay in ms before each beat appears, measured from the previous one. */
  beats: number[];
};

const TYPE_MS = 26;
const HOLD_MS = 4200;
const TICK_MS = 40;

/**
 * Plays a list of scripted conversations: types the prompt, reveals beats one by one,
 * holds, then moves to the next script. Progress is derived from elapsed time, so throttled
 * timers skip ahead instead of slowing down. Runs only while in view, and jumps straight to
 * the finished state for people who prefer reduced motion.
 */
export function useScriptedPlayback(scripts: PlaybackScript[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const script = scripts[index];
  const typeEnd = script.prompt.length * TYPE_MS;
  const beatTimes = script.beats.reduce<number[]>(
    (times, delay) => [...times, (times[times.length - 1] ?? typeEnd) + delay],
    [],
  );
  const end = (beatTimes[beatTimes.length - 1] ?? typeEnd) + HOLD_MS;

  useEffect(() => {
    if (reduced || !visible) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      setElapsed((value) => value + (now - last));
      last = now;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [reduced, visible, index]);

  useEffect(() => {
    if (elapsed >= end) select((index + 1) % scripts.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed, end]);

  function select(next: number) {
    setIndex(next);
    setElapsed(0);
  }

  const done = reduced;
  const typed = done ? script.prompt.length : Math.min(script.prompt.length, Math.floor(elapsed / TYPE_MS));
  const beat = done ? script.beats.length : beatTimes.filter((time) => elapsed >= time).length;

  return {
    ref,
    index,
    select,
    /** The prompt as typed so far. */
    prompt: script.prompt.slice(0, typed),
    typing: typed < script.prompt.length,
    /** How many beats are showing. */
    beat,
  };
}
