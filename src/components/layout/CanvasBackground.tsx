import React, { useMemo } from 'react';

interface CanvasBackgroundProps {
  width: number;
  height: number;
  metersPerPixel: number | null;
  unitSystem: 'imperial' | 'metric';
  zoom: number;
  showGrid: boolean;
  gridStyle?: 'lines' | 'dots';
}

/** Compute grid spacing in pixels for major and minor divisions */
function computeGridSpacing(
  metersPerPixel: number | null,
  unitSystem: 'imperial' | 'metric',
  zoom: number,
): { major: number; minor: number; majorLabel: string; minorLabel: string } {
  if (!metersPerPixel) {
    // Fallback: 50px / 10px at zoom 1
    return { major: 50 * zoom, minor: 10 * zoom, majorLabel: '', minorLabel: '' };
  }

  if (unitSystem === 'imperial') {
    // 1ft = 0.3048m
    const ftPerPixel = metersPerPixel / 0.3048;
    const minorPx = (1 / ftPerPixel) * zoom; // 1ft
    const majorPx = (5 / ftPerPixel) * zoom; // 5ft
    return { major: majorPx, minor: minorPx, majorLabel: 'ft', minorLabel: 'ft' };
  }

  // metric: 1m major, 0.25m minor
  const minorPx = (0.25 / metersPerPixel) * zoom;
  const majorPx = (1 / metersPerPixel) * zoom;
  return { major: majorPx, minor: minorPx, majorLabel: 'm', minorLabel: 'm' };
}

/** Generate edge labels for major grid lines */
function generateLabels(
  size: number,
  spacing: number,
  metersPerPixel: number | null,
  unitSystem: 'imperial' | 'metric',
  axis: 'x' | 'y',
) {
  if (!metersPerPixel || spacing < 20) return [];

  const labels: { pos: number; text: string }[] = [];
  const steps = Math.floor(size / spacing);

  for (let i = 1; i <= steps; i++) {
    const px = i * spacing;
    if (px >= size) break;

    let value: number;
    if (unitSystem === 'imperial') {
      value = Math.round(i * 5); // 5ft per major step
    } else {
      value = i; // 1m per major step
    }

    labels.push({ pos: px, text: `${value}` });
  }

  return labels;
}

const MIN_MINOR_SPACING = 8; // hide minor grid below this px threshold

export function CanvasBackground({
  width,
  height,
  metersPerPixel,
  unitSystem,
  zoom,
  showGrid,
  gridStyle = 'dots',
}: CanvasBackgroundProps) {
  const grid = useMemo(
    () => computeGridSpacing(metersPerPixel, unitSystem, zoom),
    [metersPerPixel, unitSystem, zoom],
  );

  const showMinor = grid.minor >= MIN_MINOR_SPACING;

  const xLabels = useMemo(
    () => generateLabels(width, grid.major, metersPerPixel, unitSystem, 'x'),
    [width, grid.major, metersPerPixel, unitSystem],
  );

  const yLabels = useMemo(
    () => generateLabels(height, grid.major, metersPerPixel, unitSystem, 'y'),
    [height, grid.major, metersPerPixel, unitSystem],
  );

  const unit = unitSystem === 'imperial' ? 'ft' : 'm';

  return (
    <svg
      width={width}
      height={height}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
    >
      <defs>
        {/* Minor grid pattern */}
        {showGrid && showMinor && gridStyle === 'dots' && (
          <pattern
            id="minor-dots"
            width={grid.minor}
            height={grid.minor}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={grid.minor}
              cy={grid.minor}
              r={0.5}
              fill="hsl(var(--foreground) / 0.1)"
            />
          </pattern>
        )}

        {showGrid && showMinor && gridStyle === 'lines' && (
          <pattern
            id="minor-lines"
            width={grid.minor}
            height={grid.minor}
            patternUnits="userSpaceOnUse"
          >
            <line
              x1={grid.minor}
              y1={0}
              x2={grid.minor}
              y2={grid.minor}
              stroke="hsl(var(--foreground) / 0.06)"
              strokeWidth={0.5}
            />
            <line
              x1={0}
              y1={grid.minor}
              x2={grid.minor}
              y2={grid.minor}
              stroke="hsl(var(--foreground) / 0.06)"
              strokeWidth={0.5}
            />
          </pattern>
        )}

        {/* Major grid pattern */}
        {showGrid && gridStyle === 'dots' && (
          <pattern
            id="major-dots"
            width={grid.major}
            height={grid.major}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={grid.major}
              cy={grid.major}
              r={1}
              fill="hsl(var(--foreground) / 0.2)"
            />
          </pattern>
        )}

        {showGrid && gridStyle === 'lines' && (
          <pattern
            id="major-lines"
            width={grid.major}
            height={grid.major}
            patternUnits="userSpaceOnUse"
          >
            <line
              x1={grid.major}
              y1={0}
              x2={grid.major}
              y2={grid.major}
              stroke="hsl(var(--foreground) / 0.12)"
              strokeWidth={0.5}
            />
            <line
              x1={0}
              y1={grid.major}
              x2={grid.major}
              y2={grid.major}
              stroke="hsl(var(--foreground) / 0.12)"
              strokeWidth={0.5}
            />
          </pattern>
        )}

        {/* Inner shadow filter for room boundary */}
        <filter id="room-inner-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feFlood floodColor="hsl(var(--foreground))" floodOpacity="0.05" result="flood" />
          <feComposite in="flood" in2="SourceGraphic" operator="out" result="comp" />
          <feGaussianBlur in="comp" stdDeviation="6" result="blur" />
          <feComposite in="blur" in2="SourceGraphic" operator="atop" />
        </filter>
      </defs>

      {/* Minor grid layer */}
      {showGrid && showMinor && (
        <rect
          width={width}
          height={height}
          fill={gridStyle === 'dots' ? 'url(#minor-dots)' : 'url(#minor-lines)'}
        />
      )}

      {/* Major grid layer */}
      {showGrid && (
        <rect
          width={width}
          height={height}
          fill={gridStyle === 'dots' ? 'url(#major-dots)' : 'url(#major-lines)'}
        />
      )}

      {/* Room boundary */}
      <rect
        x={1}
        y={1}
        width={width - 2}
        height={height - 2}
        rx={8}
        ry={8}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={1}
        filter="url(#room-inner-shadow)"
      />

      {/* Edge labels - X axis (bottom) */}
      {showGrid &&
        xLabels.map((label) => (
          <text
            key={`x-${label.pos}`}
            x={label.pos}
            y={height - 4}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize={9}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {label.text}
            {unit}
          </text>
        ))}

      {/* Edge labels - Y axis (left) */}
      {showGrid &&
        yLabels.map((label) => (
          <text
            key={`y-${label.pos}`}
            x={4}
            y={label.pos + 3}
            textAnchor="start"
            fill="hsl(var(--muted-foreground))"
            fontSize={9}
            fontFamily="Inter, system-ui, sans-serif"
          >
            {label.text}
            {unit}
          </text>
        ))}
    </svg>
  );
}
