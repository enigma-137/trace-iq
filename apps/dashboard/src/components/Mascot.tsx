export type MascotPose = 'wave' | 'waiting' | 'celebrate' | 'thinking' | 'alert' | 'sleeping';

const ALT: Record<MascotPose, string> = {
  wave: 'Trace, the TraceIQ robot, waving',
  waiting: 'Trace, the TraceIQ robot, looking through a magnifying glass',
  celebrate: 'Trace, the TraceIQ robot, celebrating',
  thinking: 'Trace, the TraceIQ robot, thinking',
  alert: 'Trace, the TraceIQ robot, holding an alert bell',
  sleeping: 'Trace, the TraceIQ robot, resting'
};

/**
 * Trace, the TraceIQ mascot. Pass the pose that matches what is happening.
 * The images are transparent, so it sits on light and dark surfaces alike.
 * The gentle float is skipped for people who prefer reduced motion.
 */
export function Mascot({
  pose,
  size = 120,
  float = true,
  className = ''
}: {
  pose: MascotPose;
  size?: number;
  float?: boolean;
  className?: string;
}) {
  return (
    <img
      src={`/brand/trace/trace-${pose}.webp`}
      alt={ALT[pose]}
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 select-none ${float ? 'motion-safe:animate-trace-float' : ''} ${className}`}
    />
  );
}
