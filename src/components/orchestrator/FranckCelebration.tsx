import { useEffect, useState } from 'react';

interface Piece {
  id: number;
  left: number;
  tx: number;
  ty: number;
  rot: number;
  color: string;
  delay: number;
  shape: 'rect' | 'circle';
}

const COLORS = [
  '#a78bfa', // violet-400
  '#c084fc', // purple-400
  '#e879f9', // fuchsia-400
  '#f0abfc', // fuchsia-300
  '#facc15', // amber-400
  '#34d399', // emerald-400
  '#60a5fa', // blue-400
];

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    tx: (Math.random() - 0.5) * 220,
    ty: 120 + Math.random() * 220,
    rot: (Math.random() - 0.5) * 720,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 200,
    shape: Math.random() > 0.4 ? 'rect' : 'circle',
  }));
}

interface Props {
  /** Trigger key — change to fire a new burst */
  trigger: number;
  /** Number of pieces (default 36) */
  count?: number;
}

/**
 * Confetti burst that fires whenever `trigger` increments.
 * Renders absolutely positioned pieces inside its parent (parent must be relative).
 */
export function FranckCelebration({ trigger, count = 36 }: Props) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    if (trigger === 0) return;
    setPieces(makePieces(count));
    const id = setTimeout(() => setPieces([]), 1700);
    return () => clearTimeout(id);
  }, [trigger, count]);

  if (pieces.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 h-0 z-50 overflow-visible"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="franck-confetti-piece"
          style={{
            left: `${p.left}%`,
            top: 0,
            background: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
            ['--tx' as string]: `${p.tx}px`,
            ['--ty' as string]: `${p.ty}px`,
            ['--rot' as string]: `${p.rot}deg`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
