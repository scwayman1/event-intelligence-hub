import type { CSSProperties } from 'react';

export function staggerDelay(index: number, baseMs = 50): CSSProperties {
  return { animationDelay: `${index * baseMs}ms`, animationFillMode: 'backwards' };
}
