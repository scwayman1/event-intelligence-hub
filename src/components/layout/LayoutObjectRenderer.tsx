import type { LayoutObject } from '@/types/events';

interface LayoutObjectRendererProps {
  obj: LayoutObject;
  isSelected: boolean;
  assignedCount: number;
  capacity: number;
}

// Simple inline SVG icons
function MicrophoneIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function WineGlassIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2h8l-1 9a5 5 0 0 1-6 0L8 2Z" />
      <line x1="12" y1="11" x2="12" y2="19" />
      <line x1="8" y1="22" x2="16" y2="22" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function MusicNoteIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="18" r="4" />
      <path d="M12 18V2l7 4" />
    </svg>
  );
}

function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function ClipboardIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );
}

function ServingDishIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18h18" />
      <path d="M4 18a8 8 0 0 1 16 0" />
      <line x1="12" y1="6" x2="12" y2="4" />
      <path d="M10 6c0-1 .5-2 2-2s2 1 2 2" />
    </svg>
  );
}

function StarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function FlagIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function TentIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 20h20L12 2Z" />
      <path d="M12 2v18" />
    </svg>
  );
}

function SpotlightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="6" r="3" />
      <path d="M8 9l-3 13h14L16 9" />
      <line x1="12" y1="9" x2="12" y2="22" />
    </svg>
  );
}

function CheckCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

/** Generate positions for chairs around a round table */
function getCircularChairPositions(count: number, radius: number) {
  const positions: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return positions;
}

/** Generate positions for chairs along the long edges of a rectangular table */
function getRectChairPositions(count: number, width: number, height: number) {
  const positions: { x: number; y: number }[] = [];
  const perSide = Math.ceil(count / 2);
  const paddingX = width * 0.1;
  const usableWidth = width - paddingX * 2;

  for (let i = 0; i < perSide && positions.length < count; i++) {
    const xFraction = perSide === 1 ? 0.5 : i / (perSide - 1);
    positions.push({
      x: -usableWidth / 2 + xFraction * usableWidth,
      y: -height / 2 - 2,
    });
  }
  for (let i = 0; i < perSide && positions.length < count; i++) {
    const xFraction = perSide === 1 ? 0.5 : i / (perSide - 1);
    positions.push({
      x: -usableWidth / 2 + xFraction * usableWidth,
      y: height / 2 + 2,
    });
  }
  return positions;
}

export function LayoutObjectRenderer({ obj, assignedCount, capacity }: LayoutObjectRendererProps) {
  const w = obj.width;
  const h = obj.height;
  const minDim = Math.min(w, h);
  const iconSize = Math.max(10, Math.min(24, minDim * 0.3));
  const hasGuests = assignedCount > 0;

  switch (obj.type) {
    case 'round_table': {
      const chairRadius = Math.min(w, h) / 2 - 2;
      const chairs = getCircularChairPositions(capacity, chairRadius);
      const chairDotSize = Math.max(3, Math.min(8, minDim * 0.06));
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-visible">
          {/* Gradient fill */}
          <div
            className="absolute inset-[3px] rounded-full"
            style={{
              background: hasGuests
                ? 'radial-gradient(circle, #fef3c7 0%, #fde68a 40%, #f59e0b20 100%)'
                : 'radial-gradient(circle, #fefce8 0%, #fef9c3 40%, #fef08a20 100%)',
            }}
          />
          {/* Center plate icon */}
          <div
            className="absolute rounded-full border border-amber-300/60"
            style={{
              width: Math.max(6, minDim * 0.18),
              height: Math.max(6, minDim * 0.18),
              background: 'radial-gradient(circle, white 40%, #fef3c7 100%)',
            }}
          />
          {/* Chair dots */}
          {chairs.map((pos, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: chairDotSize,
                height: chairDotSize,
                left: `calc(50% + ${pos.x}px - ${chairDotSize / 2}px)`,
                top: `calc(50% + ${pos.y}px - ${chairDotSize / 2}px)`,
                background: i < assignedCount ? '#d97706' : 'transparent',
                border: i < assignedCount ? '1.5px solid #b45309' : '1.5px solid #d97706',
                boxShadow: i < assignedCount ? '0 0 3px #f59e0b40' : 'none',
              }}
            />
          ))}
          {/* Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <span
              className="font-semibold text-amber-900/80 leading-tight text-center px-1 truncate max-w-[90%]"
              style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.12)), textShadow: '0 0.5px 1px rgba(255,255,255,0.8)' }}
            >
              {obj.name}
            </span>
            <span
              className="font-mono text-amber-700/70"
              style={{ fontSize: Math.max(6, Math.min(9, minDim * 0.09)) }}
            >
              {assignedCount}/{capacity}
            </span>
          </div>
        </div>
      );
    }

    case 'rect_table': {
      const chairs = getRectChairPositions(capacity, w * 0.8, h * 0.7);
      const chairDotSize = Math.max(3, Math.min(7, minDim * 0.12));
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-visible">
          {/* Gradient fill */}
          <div
            className="absolute inset-[3px] rounded-md"
            style={{
              background: hasGuests
                ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fbbf2440 100%)'
                : 'linear-gradient(135deg, #fefce8 0%, #fef9c3 50%, #fef08a30 100%)',
            }}
          />
          {/* Chair dots */}
          {chairs.map((pos, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: chairDotSize,
                height: chairDotSize,
                left: `calc(50% + ${pos.x}px - ${chairDotSize / 2}px)`,
                top: `calc(50% + ${pos.y}px - ${chairDotSize / 2}px)`,
                background: i < assignedCount ? '#d97706' : 'transparent',
                border: i < assignedCount ? '1.5px solid #b45309' : '1.5px solid #d97706',
                boxShadow: i < assignedCount ? '0 0 3px #f59e0b40' : 'none',
              }}
            />
          ))}
          {/* Label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
            <span
              className="font-semibold text-amber-900/80 leading-tight text-center px-1 truncate max-w-[90%]"
              style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.15)), textShadow: '0 0.5px 1px rgba(255,255,255,0.8)' }}
            >
              {obj.name}
            </span>
            <span
              className="font-mono text-amber-700/70"
              style={{ fontSize: Math.max(6, Math.min(9, minDim * 0.12)) }}
            >
              {assignedCount}/{capacity}
            </span>
          </div>
        </div>
      );
    }

    case 'stage':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          {/* Bold gradient */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #312e81 0%, #4338ca 30%, #6366f1 60%, #475569 100%)',
            }}
          />
          {/* Spotlight glow */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.15) 0%, transparent 60%)',
            }}
          />
          {/* Icon + label */}
          <div className="relative flex flex-col items-center justify-center gap-0.5 z-10">
            <div className="text-indigo-200/80">
              <SpotlightIcon size={iconSize} />
            </div>
            <span
              className="font-bold tracking-[0.15em] uppercase text-indigo-100/90"
              style={{ fontSize: Math.max(7, Math.min(12, minDim * 0.13)), textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'podium':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Trapezoid-feel gradient */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, #78350f 0%, #92400e 40%, #b45309 100%)',
              clipPath: 'polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)',
            }}
          />
          {/* Spotlight glow on top */}
          <div
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse at 50% 20%, rgba(251,191,36,0.3) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col items-center justify-center gap-0.5 z-10">
            <div className="text-amber-200/90">
              <MicrophoneIcon size={iconSize} />
            </div>
            <span
              className="font-semibold text-amber-100/90 text-center leading-tight"
              style={{ fontSize: Math.max(6, Math.min(10, minDim * 0.15)), textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'tent':
      return (
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Light fill */}
          <div
            className="absolute inset-[2px] rounded-lg"
            style={{
              background: 'linear-gradient(180deg, rgba(186,230,253,0.25) 0%, rgba(224,242,254,0.15) 100%)',
              border: '2px dashed rgba(56,189,248,0.35)',
            }}
          />
          {/* Tent peak indicator at top center */}
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 text-sky-400/60"
          >
            <TentIcon size={Math.max(10, Math.min(20, minDim * 0.15))} />
          </div>
          {/* Corner posts */}
          {[
            { left: 6, top: 6 },
            { right: 6, top: 6 },
            { left: 6, bottom: 6 },
            { right: 6, bottom: 6 },
          ].map((pos, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-sky-300/50 border border-sky-400/40"
              style={pos as React.CSSProperties}
            />
          ))}
          {/* Label */}
          <div className="relative flex flex-col items-center justify-center z-10">
            <span
              className="font-semibold text-sky-800/70 text-center leading-tight"
              style={{ fontSize: Math.max(8, Math.min(13, minDim * 0.08)), textShadow: '0 0.5px 1px rgba(255,255,255,0.6)' }}
            >
              {obj.name}
            </span>
            {w > 60 && h > 40 && (
              <span
                className="font-mono text-sky-600/50 mt-0.5"
                style={{ fontSize: Math.max(7, Math.min(10, minDim * 0.06)) }}
              >
                {Math.round(w)}x{Math.round(h)}
              </span>
            )}
          </div>
        </div>
      );

    case 'checkin':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          {/* Gradient */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 40%, #a7f3d080 100%)',
            }}
          />
          {/* Counter edge */}
          <div
            className="absolute bottom-0 left-[10%] right-[10%] h-[3px] rounded-full"
            style={{ background: 'linear-gradient(90deg, transparent, #10b981, transparent)' }}
          />
          <div className="relative flex items-center justify-center gap-1 z-10">
            <div className="text-emerald-600/70">
              <CheckCircleIcon size={iconSize * 0.8} />
            </div>
            <span
              className="font-semibold text-emerald-800/80 text-center leading-tight"
              style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.18)), textShadow: '0 0.5px 1px rgba(255,255,255,0.7)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'bar':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          {/* Rich amber gradient */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #78350f 0%, #92400e 30%, #b45309 60%, #d97706 100%)',
            }}
          />
          {/* Glossy bar top */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 40%, rgba(0,0,0,0.1) 100%)',
            }}
          />
          <div className="relative flex items-center justify-center gap-1 z-10">
            <div className="text-amber-200/90">
              <WineGlassIcon size={iconSize * 0.85} />
            </div>
            <span
              className="font-bold text-amber-100/90 text-center leading-tight tracking-wide uppercase"
              style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.18)), textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'dance_floor':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          {/* Checkerboard pattern */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: `
                linear-gradient(135deg, rgba(192,132,252,0.08) 0%, rgba(236,72,153,0.06) 100%),
                repeating-conic-gradient(rgba(168,85,247,0.08) 0% 25%, transparent 0% 50%) 0 0 / ${Math.max(12, minDim * 0.12)}px ${Math.max(12, minDim * 0.12)}px
              `,
            }}
          />
          {/* Subtle shimmer overlay */}
          <div
            className="absolute inset-0 rounded-md animate-pulse"
            style={{
              background: 'radial-gradient(ellipse at 30% 40%, rgba(168,85,247,0.08) 0%, transparent 50%)',
              animationDuration: '3s',
            }}
          />
          <div className="relative flex flex-col items-center justify-center gap-0.5 z-10">
            <div className="text-fuchsia-500/60">
              <MusicNoteIcon size={iconSize} />
            </div>
            <span
              className="font-bold text-fuchsia-700/70 text-center leading-tight tracking-wide uppercase"
              style={{ fontSize: Math.max(7, Math.min(12, minDim * 0.08)), textShadow: '0 0.5px 1px rgba(255,255,255,0.6)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'catering':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 40%, #fdba7440 100%)',
            }}
          />
          <div className="relative flex items-center justify-center gap-1 z-10">
            <div className="text-orange-500/70">
              <ServingDishIcon size={iconSize * 0.85} />
            </div>
            <span
              className="font-semibold text-orange-800/80 text-center leading-tight"
              style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.15)), textShadow: '0 0.5px 1px rgba(255,255,255,0.7)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'vip_area':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          {/* Gold gradient */}
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #fefce8 0%, #fef08a 20%, #fbbf24 50%, #f59e0b40 100%)',
            }}
          />
          {/* Subtle gold shimmer */}
          <div
            className="absolute inset-0 rounded-md animate-pulse"
            style={{
              background: 'radial-gradient(ellipse at 60% 30%, rgba(251,191,36,0.2) 0%, transparent 50%)',
              animationDuration: '4s',
            }}
          />
          {/* Gold border inner */}
          <div
            className="absolute inset-[2px] rounded-md border border-yellow-400/50"
          />
          <div className="relative flex flex-col items-center justify-center gap-0.5 z-10">
            <div className="text-yellow-600/80">
              <StarIcon size={iconSize * 0.75} />
            </div>
            <span
              className="font-bold text-yellow-800/90 text-center leading-tight tracking-[0.1em] uppercase"
              style={{ fontSize: Math.max(7, Math.min(12, minDim * 0.1)), textShadow: '0 0.5px 2px rgba(251,191,36,0.4)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'photo_area':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 40%, #93c5fd30 100%)',
            }}
          />
          {/* Photo frame corners */}
          {[
            { top: 3, left: 3, borderTop: '2px solid', borderLeft: '2px solid' },
            { top: 3, right: 3, borderTop: '2px solid', borderRight: '2px solid' },
            { bottom: 3, left: 3, borderBottom: '2px solid', borderLeft: '2px solid' },
            { bottom: 3, right: 3, borderBottom: '2px solid', borderRight: '2px solid' },
          ].map((style, i) => (
            <div
              key={i}
              className="absolute w-3 h-3"
              style={{ ...style, borderColor: 'rgba(59,130,246,0.35)' } as React.CSSProperties}
            />
          ))}
          <div className="relative flex items-center justify-center gap-1 z-10">
            <div className="text-blue-500/60">
              <CameraIcon size={iconSize * 0.85} />
            </div>
            <span
              className="font-semibold text-blue-800/70 text-center leading-tight"
              style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.12)), textShadow: '0 0.5px 1px rgba(255,255,255,0.7)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'registration':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-md">
          <div
            className="absolute inset-0 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 40%, #6ee7b750 100%)',
            }}
          />
          <div className="relative flex items-center justify-center gap-1 z-10">
            <div className="text-emerald-500/70">
              <ClipboardIcon size={iconSize * 0.8} />
            </div>
            <span
              className="font-semibold text-emerald-800/80 text-center leading-tight"
              style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.15)), textShadow: '0 0.5px 1px rgba(255,255,255,0.7)' }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    case 'signage':
      return (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-sm">
          <div
            className="absolute inset-0 rounded-sm"
            style={{
              background: 'linear-gradient(135deg, #f5f5f4 0%, #e7e5e4 50%, #d6d3d140 100%)',
            }}
          />
          <div className="relative flex items-center justify-center gap-0.5 z-10">
            <div className="text-stone-500/60">
              <FlagIcon size={Math.max(8, iconSize * 0.65)} />
            </div>
            <span
              className="font-medium text-stone-700/80 text-center leading-tight"
              style={{ fontSize: Math.max(6, Math.min(9, minDim * 0.2)) }}
            >
              {obj.name}
            </span>
          </div>
        </div>
      );

    default:
      // chair, aisle, custom_zone, and any other types
      return (
        <div className="relative w-full h-full flex flex-col items-center justify-center">
          <span
            className="font-medium text-foreground/70 text-center px-1 truncate max-w-full leading-tight"
            style={{ fontSize: Math.max(7, Math.min(11, minDim * 0.15)) }}
          >
            {obj.name}
          </span>
        </div>
      );
  }
}
