import { cn } from '@/lib/utils';

export type FranckMood = 'idle' | 'thinking' | 'celebrating' | 'alarmed' | 'speaking';

interface FranckAvatarProps {
  mood?: FranckMood;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

/**
 * Animated Franck avatar — a top-hat wearing maestro that reacts to context.
 * Uses pure CSS animations defined in index.css.
 */
export function FranckAvatar({ mood = 'idle', size = 'sm', className }: FranckAvatarProps) {
  const animClass =
    mood === 'thinking'    ? 'franck-avatar-think franck-avatar-glow' :
    mood === 'celebrating' ? 'franck-avatar-celebrate' :
    mood === 'alarmed'     ? 'franck-avatar-alarmed' :
    mood === 'speaking'    ? 'franck-avatar-glow' :
                             'franck-avatar-idle';

  // Eye shape changes per mood
  const eyes =
    mood === 'celebrating' ? '◠ ◠' :
    mood === 'alarmed'     ? '⊙ ⊙' :
    mood === 'thinking'    ? '◔ ◔' :
                             '• •';

  return (
    <div
      className={cn(
        'shrink-0 relative flex items-center justify-center rounded-full',
        'bg-gradient-to-br from-violet-500 via-violet-600 to-fuchsia-600',
        'text-white border-0 shadow-md shadow-violet-900/30',
        'transition-all duration-300',
        SIZE_MAP[size],
        animClass,
        className,
      )}
      aria-label={`Franck is ${mood}`}
    >
      {/* Top hat brim */}
      <span className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-[70%] h-[2px] rounded-full bg-slate-900/80" />
      {/* Top hat crown */}
      <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-[45%] h-[5px] rounded-sm bg-slate-900/85" />
      {/* Hat band */}
      <span className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[45%] h-[1.5px] bg-fuchsia-400/80" />

      {/* Face */}
      <span
        className="leading-none font-medium select-none"
        style={{ fontSize: '0.55em', letterSpacing: '-0.02em', marginTop: '0.15em' }}
      >
        {eyes}
      </span>
    </div>
  );
}
