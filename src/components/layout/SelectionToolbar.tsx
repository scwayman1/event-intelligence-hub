import React, { useMemo } from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  ArrowLeftRight,
  ArrowUpDown,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SelectionToolbarProps {
  selectedObjects: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  onAlign: (
    edge: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
  ) => void;
  onDistribute: (axis: 'horizontal' | 'vertical') => void;
  onDelete: () => void;
}

export function SelectionToolbar({
  selectedObjects,
  onAlign,
  onDistribute,
  onDelete,
}: SelectionToolbarProps) {
  const boundingBox = useMemo(() => {
    if (selectedObjects.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let _maxY = -Infinity;

    for (const obj of selectedObjects) {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + obj.width);
      _maxY = Math.max(_maxY, obj.y + obj.height);
    }

    return { x: minX, y: minY, width: maxX - minX };
  }, [selectedObjects]);

  if (selectedObjects.length < 2 || !boundingBox) return null;

  const toolbarX = boundingBox.x + boundingBox.width / 2;
  const toolbarY = boundingBox.y - 52;

  const actions: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: 'ghost' | 'destructive';
  }[] = [
    {
      label: 'Align Left',
      icon: <AlignLeft className="h-4 w-4" />,
      onClick: () => onAlign('left'),
    },
    {
      label: 'Align Center',
      icon: <AlignCenter className="h-4 w-4" />,
      onClick: () => onAlign('center'),
    },
    {
      label: 'Align Right',
      icon: <AlignRight className="h-4 w-4" />,
      onClick: () => onAlign('right'),
    },
    {
      label: 'Align Top',
      icon: <AlignStartVertical className="h-4 w-4" />,
      onClick: () => onAlign('top'),
    },
    {
      label: 'Align Middle',
      icon: <AlignCenterVertical className="h-4 w-4" />,
      onClick: () => onAlign('middle'),
    },
    {
      label: 'Align Bottom',
      icon: <AlignEndVertical className="h-4 w-4" />,
      onClick: () => onAlign('bottom'),
    },
    {
      label: 'Distribute Horizontally',
      icon: <ArrowLeftRight className="h-4 w-4" />,
      onClick: () => onDistribute('horizontal'),
    },
    {
      label: 'Distribute Vertically',
      icon: <ArrowUpDown className="h-4 w-4" />,
      onClick: () => onDistribute('vertical'),
    },
    {
      label: 'Delete',
      icon: <Trash2 className="h-4 w-4" />,
      onClick: () => { if (window.confirm('Delete selected objects?')) onDelete(); },
      variant: 'destructive' as const,
    },
  ];

  return (
    <div
      className={cn(
        'absolute z-50 flex items-center gap-0.5 rounded-lg border bg-background px-1 py-1 shadow-lg',
        'transform -translate-x-1/2'
      )}
      style={{
        left: toolbarX,
        top: toolbarY,
      }}
    >
      {actions.map((action) => (
        <Button
          key={action.label}
          variant={action.variant ?? 'ghost'}
          size="icon"
          className="h-8 w-8"
          title={action.label}
          onClick={action.onClick}
        >
          {action.icon}
        </Button>
      ))}
    </div>
  );
}
