import { useState, useId } from 'react';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: number | string;
}

export function DonutChart({
  segments,
  size = 200,
  strokeWidth = 28,
  centerLabel = 'Total',
  centerValue,
}: DonutChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const filterId = useId();
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const displayValue = centerValue ?? total;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2">
        <svg width={size} height={size}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-muted"
          />
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-sm"
          >
            No data
          </text>
        </svg>
      </div>
    );
  }

  // Build arcs
  let accumulated = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((seg, i) => {
      const fraction = seg.value / total;
      const offset = circumference - fraction * circumference;
      const rotation = (accumulated / total) * 360 - 90;
      accumulated += seg.value;
      return { ...seg, fraction, offset, rotation, index: i };
    });

  return (
    <div className="flex flex-col items-center gap-3 relative">
      <svg width={size} height={size} className="drop-shadow-sm">
        <defs>
          <filter id={`shadow-${filterId}`}>
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.1" />
          </filter>
        </defs>
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted/50"
        />
        {/* Segments */}
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={hoveredIndex === i ? strokeWidth + 4 : strokeWidth}
            stroke={arc.color}
            strokeLinecap="butt"
            className="transition-all duration-500 ease-out"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: arc.offset,
              transform: `rotate(${arc.rotation}deg)`,
              transformOrigin: '50% 50%',
              opacity: hoveredIndex !== null && hoveredIndex !== i ? 0.4 : 1,
              animation: `donut-fill-in 0.8s ease-out ${i * 0.1}s both`,
            }}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}
        {/* Center text */}
        <text
          x={center}
          y={center - 8}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground font-bold text-3xl"
          style={{ fontSize: '2rem' }}
        >
          {displayValue}
        </text>
        <text
          x={center}
          y={center + 16}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground"
          style={{ fontSize: '0.7rem' }}
        >
          {centerLabel}
        </text>
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && arcs[hoveredIndex] && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 bg-popover text-popover-foreground text-xs font-medium px-3 py-1.5 rounded-md shadow-lg border pointer-events-none z-10">
          {arcs[hoveredIndex].label}: {arcs[hoveredIndex].value} (
          {Math.round(arcs[hoveredIndex].fraction * 100)}%)
        </div>
      )}

      {/* Legend */}
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
            {arc.label} ({arc.value})
          </span>
        ))}
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes donut-fill-in {
          from {
            stroke-dashoffset: ${circumference};
          }
        }
      `}</style>
    </div>
  );
}
