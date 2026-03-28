import React from 'react';

interface SnapGuide {
  axis: 'x' | 'y';
  position: number;
  type: 'edge' | 'center' | 'equal-spacing';
}

interface SnapGuideOverlayProps {
  guides: SnapGuide[];
  canvasWidth: number;
  canvasHeight: number;
}

function getGuideStyle(type: SnapGuide['type']): {
  stroke: string;
  dasharray: string | undefined;
} {
  switch (type) {
    case 'edge':
      return { stroke: 'rgb(59,130,246)', dasharray: undefined };
    case 'center':
      return { stroke: 'rgb(168,85,247)', dasharray: '4,4' };
    case 'equal-spacing':
      return { stroke: 'rgb(251,146,60)', dasharray: undefined };
  }
}

export function SnapGuideOverlay({
  guides,
  canvasWidth,
  canvasHeight,
}: SnapGuideOverlayProps) {
  if (guides.length === 0) return null;

  return (
    <svg
      className="absolute inset-0"
      width={canvasWidth}
      height={canvasHeight}
      style={{ pointerEvents: 'none' }}
    >
      {guides.map((guide, i) => {
        const { stroke, dasharray } = getGuideStyle(guide.type);

        if (guide.axis === 'x') {
          // Vertical line at x = position, full canvas height
          return (
            <line
              key={`guide-${i}`}
              x1={guide.position}
              y1={0}
              x2={guide.position}
              y2={canvasHeight}
              stroke={stroke}
              strokeWidth={0.5}
              strokeDasharray={dasharray}
              className="guide-appear"
            />
          );
        }

        // Horizontal line at y = position, full canvas width
        return (
          <line
            key={`guide-${i}`}
            x1={0}
            y1={guide.position}
            x2={canvasWidth}
            y2={guide.position}
            stroke={stroke}
            strokeWidth={0.5}
            strokeDasharray={dasharray}
            className="guide-appear"
          />
        );
      })}
    </svg>
  );
}
