export interface BarChartItem {
  label: string;
  value: number;
  maxValue: number;
}

interface BarChartProps {
  items: BarChartItem[];
  height?: number;
}

function barColor(pct: number): string {
  if (pct > 95) return '#ef4444';      // red-500
  if (pct >= 80) return '#f59e0b';     // amber-500
  return '#22c55e';                     // green-500
}

function barBg(pct: number): string {
  if (pct > 95) return 'rgba(239,68,68,0.12)';
  if (pct >= 80) return 'rgba(245,158,11,0.12)';
  return 'rgba(34,197,94,0.12)';
}

export function BarChart({ items, height = 28 }: BarChartProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No tables to display
      </p>
    );
  }

  const maxLabel = Math.max(...items.map((i) => i.label.length));
  const labelWidth = Math.min(maxLabel * 8 + 16, 140);
  const chartWidth = 600;
  const barAreaWidth = chartWidth - labelWidth - 60;
  const totalHeight = items.length * (height + 8) + 8;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${chartWidth} ${totalHeight}`}
        className="drop-shadow-sm"
        style={{ maxHeight: Math.min(totalHeight, 400) }}
      >
        {items.map((item, i) => {
          const pct = item.maxValue > 0 ? (item.value / item.maxValue) * 100 : 0;
          const fill = barColor(pct);
          const bg = barBg(pct);
          const barWidth = item.maxValue > 0 ? (item.value / item.maxValue) * barAreaWidth : 0;
          const y = i * (height + 8) + 4;

          return (
            <g key={i}>
              {/* Label */}
              <text
                x={labelWidth - 8}
                y={y + height / 2}
                textAnchor="end"
                dominantBaseline="central"
                className="fill-foreground"
                style={{ fontSize: '0.72rem', fontWeight: 500 }}
              >
                {item.label}
              </text>

              {/* Background bar */}
              <rect
                x={labelWidth}
                y={y}
                width={barAreaWidth}
                height={height}
                rx={6}
                fill={bg}
              />

              {/* Filled bar */}
              <rect
                x={labelWidth}
                y={y}
                width={Math.max(barWidth, 0)}
                height={height}
                rx={6}
                fill={fill}
                opacity={0.85}
                style={{
                  animation: `bar-grow-in 0.6s ease-out ${i * 0.08}s both`,
                }}
              />

              {/* Percentage label */}
              <text
                x={labelWidth + barAreaWidth + 8}
                y={y + height / 2}
                dominantBaseline="central"
                className="fill-muted-foreground"
                style={{ fontSize: '0.68rem', fontWeight: 600 }}
              >
                {Math.round(pct)}%
              </text>
            </g>
          );
        })}

        <style>{`
          @keyframes bar-grow-in {
            from {
              width: 0;
            }
          }
        `}</style>
      </svg>
    </div>
  );
}
