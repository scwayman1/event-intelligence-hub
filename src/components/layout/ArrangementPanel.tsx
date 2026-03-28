import { useState } from 'react';
import { LayoutGrid, Circle, Rows3, ArrowRight } from 'lucide-react';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  arrangeGrid,
  arrangeCircle,
  arrangeRows,
  type ArrangeableObject,
  type ArrangementResult,
} from '@/lib/arrangement-engine';

type PatternType = 'grid' | 'circle' | 'rows' | 'staggered';

interface ArrangementPanelProps {
  tables: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  boundsWidth: number;
  boundsHeight: number;
  onArrange: (results: ArrangementResult[]) => void;
}

/** Small SVG thumbnail showing a dot pattern for each arrangement type. */
function PatternPreview({
  pattern,
  active,
}: {
  pattern: PatternType;
  active: boolean;
}) {
  const dotClass = active ? 'fill-primary' : 'fill-muted-foreground/50';
  const size = 48;

  const dots: { cx: number; cy: number }[] = [];

  switch (pattern) {
    case 'grid':
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          dots.push({ cx: 10 + c * 14, cy: 10 + r * 14 });
        }
      }
      break;
    case 'circle': {
      const cx = size / 2;
      const cy = size / 2;
      const rad = 16;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        dots.push({ cx: cx + rad * Math.cos(a), cy: cy + rad * Math.sin(a) });
      }
      break;
    }
    case 'rows':
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          dots.push({ cx: 6 + c * 12, cy: 10 + r * 14 });
        }
      }
      break;
    case 'staggered':
      for (let r = 0; r < 3; r++) {
        const offset = r % 2 === 1 ? 6 : 0;
        for (let c = 0; c < 4; c++) {
          dots.push({ cx: 6 + c * 12 + offset, cy: 10 + r * 14 });
        }
      }
      break;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={3} className={dotClass} />
      ))}
    </svg>
  );
}

const PATTERNS: { type: PatternType; label: string; icon: typeof LayoutGrid }[] = [
  { type: 'grid', label: 'Grid', icon: LayoutGrid },
  { type: 'circle', label: 'Circle', icon: Circle },
  { type: 'rows', label: 'Rows', icon: Rows3 },
  { type: 'staggered', label: 'Staggered', icon: Rows3 },
];

export function ArrangementPanel({
  tables,
  boundsWidth,
  boundsHeight,
  onArrange,
}: ArrangementPanelProps) {
  const [open, setOpen] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState<PatternType>('grid');
  const [spacing, setSpacing] = useState(20);
  const [columns, setColumns] = useState(0); // 0 = auto
  const [radius, setRadius] = useState(0); // 0 = auto
  const [preview, setPreview] = useState<ArrangementResult[] | null>(null);

  function computeArrangement(): ArrangementResult[] {
    const objs: ArrangeableObject[] = tables;

    switch (selectedPattern) {
      case 'grid':
        return arrangeGrid(objs, {
          cols: columns > 0 ? columns : undefined,
          spacingX: spacing,
          spacingY: spacing,
          boundsWidth,
          boundsHeight,
        });
      case 'circle':
        return arrangeCircle(objs, {
          centerX: boundsWidth / 2,
          centerY: boundsHeight / 2,
          radius: radius > 0 ? radius : undefined,
        });
      case 'rows':
        return arrangeRows(objs, {
          spacingX: spacing,
          spacingY: spacing,
          stagger: false,
          boundsWidth,
        });
      case 'staggered':
        return arrangeRows(objs, {
          spacingX: spacing,
          spacingY: spacing,
          stagger: true,
          boundsWidth,
        });
    }
  }

  function handlePreview() {
    setPreview(computeArrangement());
  }

  function handleApply() {
    const results = preview ?? computeArrangement();
    onArrange(results);
    setPreview(null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <LayoutGrid className="mr-1 h-4 w-4" />
          Arrange
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <h4 className="text-sm font-medium leading-none">
            Arrange Tables
          </h4>

          {/* Pattern selector */}
          <div className="grid grid-cols-4 gap-2">
            {PATTERNS.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => {
                  setSelectedPattern(type);
                  setPreview(null);
                }}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors',
                  selectedPattern === type
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-transparent hover:bg-muted',
                )}
              >
                <PatternPreview
                  pattern={type}
                  active={selectedPattern === type}
                />
                {label}
              </button>
            ))}
          </div>

          {/* Shared config: spacing */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Spacing (px)
            </label>
            <input
              type="number"
              min={0}
              value={spacing}
              onChange={(e) => {
                setSpacing(Number(e.target.value));
                setPreview(null);
              }}
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
            />
          </div>

          {/* Grid-specific: columns */}
          {selectedPattern === 'grid' && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Columns (0 = auto)
              </label>
              <input
                type="number"
                min={0}
                value={columns}
                onChange={(e) => {
                  setColumns(Number(e.target.value));
                  setPreview(null);
                }}
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              />
            </div>
          )}

          {/* Circle-specific: radius */}
          {selectedPattern === 'circle' && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">
                Radius (0 = auto)
              </label>
              <input
                type="number"
                min={0}
                value={radius}
                onChange={(e) => {
                  setRadius(Number(e.target.value));
                  setPreview(null);
                }}
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handlePreview}
            >
              Preview
            </Button>
            <Button size="sm" className="flex-1" onClick={handleApply}>
              Apply
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
