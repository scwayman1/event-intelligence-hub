import { useState, useRef, useCallback, useEffect } from 'react';
import type { LayoutObject } from '@/types/events';
import { snapToObjects } from '@/lib/snap-engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCanvasInteractionOptions {
  objects: LayoutObject[];
  updateObject: (id: string, updates: Partial<LayoutObject>) => void;
  snapMode: 'grid' | 'measured' | 'free';
  snapValue: (v: number) => number;
  metersPerPixel: number | null;
}

interface DragState {
  id: string;
  offsetX: number;
  offsetY: number;
}

interface ActiveGuide {
  axis: 'x' | 'y';
  position: number;
  type: string;
}

export interface UseCanvasInteractionReturn {
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  handleWheel: (e: React.WheelEvent) => void;
  dragState: DragState | null;
  isDragging: boolean;
  activeGuides: ActiveGuide[];
  startDrag: (e: React.MouseEvent, obj: LayoutObject) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4.0;
const ZOOM_SENSITIVITY = 0.001;
const OBJECT_SNAP_THRESHOLD = 5;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasInteraction(
  options: UseCanvasInteractionOptions,
): UseCanvasInteractionReturn {
  const { objects, updateObject, snapMode, snapValue, metersPerPixel } = options;

  const [zoom, setZoom] = useState(1);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [activeGuides, setActiveGuides] = useState<ActiveGuide[]>([]);

  // Refs for rAF-based drag updates
  const latestMousePos = useRef<{ clientX: number; clientY: number } | null>(null);
  const rafId = useRef<number | null>(null);
  const canvasRectRef = useRef<DOMRect | null>(null);

  // Keep options in refs so the rAF callback always sees latest values
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // ── Scroll-to-zoom ────────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();

    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    setZoom((prevZoom) => {
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom + delta * prevZoom));
      return Math.round(newZoom * 100) / 100; // avoid float noise
    });
  }, []);

  // ── rAF update loop for drag ──────────────────────────────────────────────

  const updateDragPosition = useCallback(() => {
    rafId.current = null;

    const drag = dragStateRef.current;
    const mouse = latestMousePos.current;
    const rect = canvasRectRef.current;
    if (!drag || !mouse || !rect) return;

    const currentZoom = zoomRef.current;
    const { snapMode: currentSnapMode, snapValue: currentSnapValue, objects: currentObjects, updateObject: currentUpdate } = optionsRef.current;

    const rawX = (mouse.clientX - rect.left - drag.offsetX) / currentZoom;
    const rawY = (mouse.clientY - rect.top - drag.offsetY) / currentZoom;

    let finalX: number;
    let finalY: number;
    let guides: ActiveGuide[] = [];

    if (currentSnapMode === 'measured' || currentSnapMode === 'grid') {
      // First apply grid/measured snap
      const gridSnappedX = currentSnapValue(rawX);
      const gridSnappedY = currentSnapValue(rawY);

      // Then try object-to-object snapping on top
      const movingObj = currentObjects.find((o) => o.id === drag.id);
      if (movingObj) {
        const others = currentObjects.filter((o) => o.id !== drag.id && o.visible && !o.locked);
        const result = snapToObjects(
          { ...movingObj, x: gridSnappedX, y: gridSnappedY },
          others,
          OBJECT_SNAP_THRESHOLD,
        );
        finalX = result.x;
        finalY = result.y;

        if (result.guides.length > 0) {
          const seen = new Set<string>();
          guides = result.guides
            .map((g) => ({ axis: g.axis, position: g.guidePosition, type: g.type }))
            .filter((g) => {
              const key = `${g.axis}:${g.position}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
        }
      } else {
        finalX = gridSnappedX;
        finalY = gridSnappedY;
      }
    } else {
      // Free mode: no snapping
      finalX = rawX;
      finalY = rawY;
    }

    currentUpdate(drag.id, { x: finalX, y: finalY });
    setActiveGuides(guides);
  }, []);

  // ── Start drag ────────────────────────────────────────────────────────────

  const startDrag = useCallback((e: React.MouseEvent, obj: LayoutObject) => {
    if (obj.locked) return;
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const newDrag: DragState = {
      id: obj.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    setDragState(newDrag);

    // Cache the canvas rect (parent of the object container)
    // We walk up to find the canvas container; the caller should ensure the
    // object is rendered inside the canvas div.
    const canvasEl = (e.currentTarget as HTMLElement).closest('[data-canvas]');
    if (canvasEl) {
      canvasRectRef.current = canvasEl.getBoundingClientRect();
    }
  }, []);

  // ── Window-level mousemove / mouseup during drag ──────────────────────────

  useEffect(() => {
    if (!dragState) return;

    const onMove = (e: MouseEvent) => {
      latestMousePos.current = { clientX: e.clientX, clientY: e.clientY };

      // Schedule an update on the next animation frame if one isn't pending
      if (rafId.current === null) {
        rafId.current = requestAnimationFrame(updateDragPosition);
      }
    };

    const onUp = () => {
      // Cancel any pending rAF
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
      latestMousePos.current = null;
      canvasRectRef.current = null;
      setDragState(null);
      setActiveGuides([]);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [dragState, updateDragPosition]);

  // ── Suppress unused-variable warnings for metersPerPixel ──────────────────
  // metersPerPixel is accepted for future unit-aware snapping; accessed via
  // optionsRef so the linter sees a read.
  void metersPerPixel;

  return {
    zoom,
    setZoom,
    handleWheel,
    dragState,
    isDragging: dragState !== null,
    activeGuides,
    startDrag,
  };
}
