import { useState } from 'react';

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface CategoryPieChartProps {
  slices: PieSlice[];
  size?: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

export function CategoryPieChart({ slices, size = 160 }: CategoryPieChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  const center = size / 2;
  const radius = size / 2 - 4;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <svg width={size} height={size}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="fill-muted/50"
          />
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-xs"
          >
            No data
          </text>
        </svg>
      </div>
    );
  }

  let accumulated = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((sl) => {
      const startAngle = (accumulated / total) * 360;
      accumulated += sl.value;
      const endAngle = (accumulated / total) * 360;
      const fraction = sl.value / total;
      return { ...sl, startAngle, endAngle, fraction };
    });

  return (
    <div className="flex flex-col items-center gap-3 relative">
      <svg width={size} height={size} className="drop-shadow-sm">
        {arcs.map((arc, i) => {
          const isHovered = hoveredIndex === i;
          // For a full circle (single slice), draw a circle instead
          if (arc.endAngle - arc.startAngle >= 359.99) {
            return (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill={arc.color}
                opacity={hoveredIndex !== null && !isHovered ? 0.4 : 1}
                className="transition-opacity duration-200"
                style={{
                  animation: `pie-grow 0.6s ease-out both`,
                }}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          }
          const path = describeArc(center, center, radius, arc.startAngle, arc.endAngle);
          return (
            <path
              key={i}
              d={path}
              fill={arc.color}
              stroke="hsl(var(--card))"
              strokeWidth={2}
              opacity={hoveredIndex !== null && !isHovered ? 0.4 : 1}
              className="transition-all duration-200 cursor-default"
              style={{
                transform: isHovered ? 'scale(1.04)' : 'scale(1)',
                transformOrigin: '50% 50%',
                animation: `pie-grow 0.6s ease-out ${i * 0.08}s both`,
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          );
        })}

        <style>{`
          @keyframes pie-grow {
            from {
              opacity: 0;
              transform: scale(0.7);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && arcs[hoveredIndex] && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 bg-popover text-popover-foreground text-xs font-medium px-3 py-1.5 rounded-md shadow-lg border pointer-events-none z-10 whitespace-nowrap">
          {arcs[hoveredIndex].label}: {arcs[hoveredIndex].value} (
          {Math.round(arcs[hoveredIndex].fraction * 100)}%)
        </div>
      )}

      {/* Legend below */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
        {arcs.map((arc, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-default"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: arc.color }}
            />
            {arc.label}
          </span>
        ))}
      </div>
    </div>
  );
}
