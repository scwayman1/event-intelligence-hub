import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface ObjectWrapperProps {
  obj: {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    type: string;
    locked?: boolean;
  };
  isSelected: boolean;
  isDragging: boolean;
  isHovered: boolean;
  isDropTarget?: boolean;
  children: React.ReactNode;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  className?: string;
}

/** Border color per object type for idle state */
function getBorderColor(type: string): string {
  switch (type) {
    case 'round_table':
    case 'rect_table':
      return 'border-amber-400/40';
    case 'stage':
    case 'podium':
      return 'border-indigo-400/40';
    case 'tent':
      return 'border-sky-400/40';
    case 'bar':
      return 'border-amber-600/40';
    case 'dance_floor':
      return 'border-fuchsia-400/40';
    case 'checkin':
    case 'registration':
      return 'border-emerald-400/40';
    case 'vip_area':
      return 'border-yellow-400/40';
    case 'photo_area':
      return 'border-blue-400/40';
    case 'catering':
      return 'border-orange-400/40';
    case 'signage':
      return 'border-stone-400/40';
    default:
      return 'border-border';
  }
}

/** Brighter border color for hover state */
function getHoverBorderColor(type: string): string {
  switch (type) {
    case 'round_table':
    case 'rect_table':
      return 'border-amber-400/70';
    case 'stage':
    case 'podium':
      return 'border-indigo-400/70';
    case 'tent':
      return 'border-sky-400/70';
    case 'bar':
      return 'border-amber-600/70';
    case 'dance_floor':
      return 'border-fuchsia-400/70';
    case 'checkin':
    case 'registration':
      return 'border-emerald-400/70';
    case 'vip_area':
      return 'border-yellow-400/70';
    case 'photo_area':
      return 'border-blue-400/70';
    case 'catering':
      return 'border-orange-400/70';
    case 'signage':
      return 'border-stone-400/70';
    default:
      return 'border-foreground/30';
  }
}

export function ObjectWrapper({
  obj,
  isSelected,
  isDragging,
  isHovered,
  isDropTarget = false,
  children,
  onMouseDown,
  onClick,
  onMouseEnter,
  onMouseLeave,
  className,
}: ObjectWrapperProps) {
  const isLocked = obj.locked ?? false;

  const positionStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute',
      left: obj.x,
      top: obj.y,
      width: obj.width,
      height: obj.height,
      transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
      transformOrigin: 'center center',
    }),
    [obj.x, obj.y, obj.width, obj.height, obj.rotation],
  );

  const shadowStyle: React.CSSProperties = useMemo(() => {
    if (isDragging) {
      return { boxShadow: '0 12px 32px rgba(0,0,0,0.2)' };
    }
    if (isHovered && !isLocked) {
      return { boxShadow: '0 4px 12px rgba(0,0,0,0.12)' };
    }
    return { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' };
  }, [isDragging, isHovered, isLocked]);

  return (
    <div
      data-object-id={obj.id}
      style={{ ...positionStyle, ...shadowStyle }}
      className={cn(
        // Base styles
        'border rounded-md transition-all duration-150 ease-out select-none',

        // Idle border color (type-based)
        !isHovered && !isSelected && !isDragging && !isDropTarget && getBorderColor(obj.type),

        // Hover state
        isHovered && !isDragging && !isLocked && [
          getHoverBorderColor(obj.type),
          'scale-[1.01]',
        ],

        // Selected state
        isSelected && !isDragging && [
          'ring-2 ring-primary',
          'layout-object-selected',
        ],

        // Dragging state
        isDragging && [
          'opacity-70 scale-[1.03]',
          'z-50',
          'layout-object-dragging',
        ],

        // Drop target state (tent glow)
        isDropTarget && [
          'layout-drop-target',
          'border-emerald-400',
        ],

        // Locked state
        isLocked && 'cursor-not-allowed opacity-70',

        // Normal cursor
        !isLocked && 'cursor-grab',
        !isLocked && isDragging && 'cursor-grabbing',

        className,
      )}
      onMouseDown={isLocked ? undefined : onMouseDown}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>
  );
}
