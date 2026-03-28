import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface HealthScoreCardProps {
  icon: React.ReactNode;
  label: string;
  score: number; // 0-100
  detail: string; // e.g., "23 of 45 confirmed"
  color?: string; // override color
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'emerald';
  if (score >= 50) return 'amber';
  return 'rose';
}

const COLOR_MAP: Record<string, { stroke: string; bg: string; text: string; glow: string }> = {
  emerald: {
    stroke: 'stroke-emerald-500',
    bg: 'from-emerald-500/10 to-emerald-600/5',
    text: 'text-emerald-500',
    glow: 'shadow-emerald-500/20',
  },
  amber: {
    stroke: 'stroke-amber-500',
    bg: 'from-amber-500/10 to-amber-600/5',
    text: 'text-amber-500',
    glow: 'shadow-amber-500/20',
  },
  rose: {
    stroke: 'stroke-rose-500',
    bg: 'from-rose-500/10 to-rose-600/5',
    text: 'text-rose-500',
    glow: 'shadow-rose-500/20',
  },
};

export function HealthScoreCard({ icon, label, score, detail, color }: HealthScoreCardProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const frameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const colorKey = color ?? getScoreColor(score);
  const colors = COLOR_MAP[colorKey] ?? COLOR_MAP.emerald;

  // SVG ring dimensions
  const size = 72;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  useEffect(() => {
    const duration = 1200; // ms
    startTimeRef.current = performance.now();
    const target = Math.max(0, Math.min(100, score));

    function animate(now: number) {
      const elapsed = now - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [score]);

  return (
    <div
      className={cn(
        'relative rounded-xl border border-white/10 dark:border-white/5 p-4',
        'bg-gradient-to-br backdrop-blur-xl',
        'shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
        colors.bg,
        colors.glow,
      )}
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 rounded-xl opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, currentColor 0%, transparent 70%)' }}
      />

      <div className="relative flex items-center gap-4">
        {/* Circular progress ring */}
        <div className="relative shrink-0">
          <svg width={size} height={size} className="-rotate-90">
            {/* Background ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-muted-foreground/10"
              strokeWidth={strokeWidth}
            />
            {/* Animated ring */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              className={colors.stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.1s ease-out' }}
            />
          </svg>
          {/* Score number in center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('text-lg font-bold font-mono', colors.text)}>
              {animatedScore}
            </span>
          </div>
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <div className={cn('mb-1.5', colors.text)}>{icon}</div>
          <p className="text-sm font-semibold text-foreground truncate">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</p>
        </div>
      </div>
    </div>
  );
}
