import React, { useState, useCallback, useEffect, useRef } from 'react';

export interface SelectionMarqueeProps {
  canvasRef: React.RefObject<HTMLDivElement>;
  zoom: number;
  onSelect: (rect: { x: number; y: number; width: number; height: number }) => void;
  active: boolean;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

function toCanvasRect(
  drag: DragState,
  canvasRect: DOMRect,
  zoom: number
): { x: number; y: number; width: number; height: number } {
  const x1 = (drag.startX - canvasRect.left) / zoom;
  const y1 = (drag.startY - canvasRect.top) / zoom;
  const x2 = (drag.currentX - canvasRect.left) / zoom;
  const y2 = (drag.currentY - canvasRect.top) / zoom;

  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

export function SelectionMarquee({
  canvasRef,
  zoom,
  onSelect,
  active,
}: SelectionMarqueeProps) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const draggingRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!active) return;
      // Only trigger on primary button and direct canvas clicks
      if (e.button !== 0) return;
      if (e.target !== canvasRef.current) return;

      draggingRef.current = true;
      setDrag({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
      });
    },
    [active, canvasRef]
  );

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingRef.current) return;
    setDrag((prev) =>
      prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null
    );
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    setDrag((prev) => {
      if (prev && canvasRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const selectionRect = toCanvasRect(prev, canvasRect, zoom);
        if (selectionRect.width > 2 && selectionRect.height > 2) {
          onSelect(selectionRect);
        }
      }
      return null;
    });
  }, [canvasRef, zoom, onSelect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [canvasRef, active, handleMouseDown, handleMouseMove, handleMouseUp]);

  if (!drag || !canvasRef.current) return null;

  const canvasRect = canvasRef.current.getBoundingClientRect();
  const left = Math.min(drag.startX, drag.currentX) - canvasRect.left;
  const top = Math.min(drag.startY, drag.currentY) - canvasRect.top;
  const width = Math.abs(drag.currentX - drag.startX);
  const height = Math.abs(drag.currentY - drag.startY);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        border: '1px dashed rgba(59, 130, 246, 0.7)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
}
