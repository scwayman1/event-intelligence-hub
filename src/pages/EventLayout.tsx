import { useParams, useOutletContext } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  ZoomIn, ZoomOut, Lock, Unlock, Eye, EyeOff,
  Plus, Trash2, Grid3X3, Layers, ImageIcon, X, Satellite, Sparkles, Users, Ruler, WandSparkles,
  Box, Calculator, Move, ArrowLeftRight, ArrowUpDown,
  ArrowUpToLine, ArrowDownToLine, RotateCw, Maximize2, Tag, StickyNote,
  CircleDot, Square, Tent, Mic, CheckSquare, Camera, Star, Footprints, Music, UtensilsCrossed, Beer, Type, LayoutGrid,
  PenTool, ChevronDown, Circle, RectangleHorizontal, Coffee, Undo2, Redo2
} from 'lucide-react';

interface LayoutOutletContext {
  showInspector: boolean;
  setShowInspector: (v: boolean) => void;
}
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SaveIndicator } from '@/components/SaveIndicator';
import { cn } from '@/lib/utils';
import { type UnitSystem, formatScale, formatDimension, userInputToMeters, metersToUserUnit, formatWithUnit, formatDistance } from '@/lib/units';
import { buildEventAnalytics } from '@/lib/event-analytics';
import { metersToPixels, supportPresets, tablePresets, drawableTypes, structurePresets, stationPresets, type ObjectPreset } from '@/lib/layout-presets';
import { calculateTableFit, edgeDistances, nearestEdgeDistances, type RoomBounds } from '@/lib/space-calculator';
import type { LayoutObject, LayoutObjectType } from '@/types/events';
import { LayoutObjectRenderer } from '@/components/layout/LayoutObjectRenderer';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TableDetailPopover } from '@/components/layout/TableDetailPopover';
import { useSelectionManager } from '@/hooks/useSelectionManager';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { SnapGuideOverlay } from '@/components/layout/SnapGuideOverlay';
import { SelectionToolbar } from '@/components/layout/SelectionToolbar';
import { SelectionMarquee } from '@/components/layout/SelectionMarquee';
import { ArrangementPanel } from '@/components/layout/ArrangementPanel';
import { snapToObjects, computeSnapGuides } from '@/lib/snap-engine';
import { alignObjects, distributeEqual } from '@/lib/arrangement-engine';
import { moveContainedObjects } from '@/lib/tent-containment';

const VenueCapture = lazy(() => import('@/components/layout/VenueCapture'));

// ─── Grid overlay component ────────────────────────────────────────────────────
interface GridOverlayProps {
  metersPerPixel: number;
  unitSystem: UnitSystem;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  snappedLines?: { x: number | null; y: number | null };
}

function GridOverlay({ metersPerPixel, unitSystem, canvasWidth, canvasHeight, zoom, snappedLines }: GridOverlayProps) {
  const majorInterval = unitSystem === 'imperial' ? 5 * 0.3048 : 1; // 5ft or 1m
  const minorInterval = unitSystem === 'imperial' ? 1 * 0.3048 : 0.25; // 1ft or 0.25m
  const majorPx = majorInterval / metersPerPixel;
  const minorPx = minorInterval / metersPerPixel;

  // Skip minor lines if too dense at current zoom
  const showMinor = minorPx * zoom >= 8;
  // If even major lines are too dense, double the interval until they are visible
  let effectiveMajorPx = majorPx;
  let effectiveMajorInterval = majorInterval;
  while (effectiveMajorPx * zoom < 10) {
    effectiveMajorPx *= 2;
    effectiveMajorInterval *= 2;
  }

  const unitLabel = unitSystem === 'imperial' ? 'ft' : 'm';
  const majorStep = unitSystem === 'imperial'
    ? effectiveMajorInterval / 0.3048 // back to feet
    : effectiveMajorInterval; // meters

  // Build vertical lines
  const vLines: React.ReactNode[] = [];
  const hLines: React.ReactNode[] = [];
  const topLabels: React.ReactNode[] = [];
  const leftLabels: React.ReactNode[] = [];

  // Minor vertical lines
  if (showMinor) {
    for (let px = minorPx; px < canvasWidth; px += minorPx) {
      // Skip positions that fall on a major line
      const onMajor = Math.abs(Math.round(px / effectiveMajorPx) * effectiveMajorPx - px) < 0.5;
      if (onMajor) continue;
      vLines.push(
        <line key={`mv-${px}`} x1={px} y1={0} x2={px} y2={canvasHeight}
          stroke="hsl(var(--border))" strokeOpacity={0.1} strokeWidth={1} />
      );
    }
  }
  // Minor horizontal lines
  if (showMinor) {
    for (let px = minorPx; px < canvasHeight; px += minorPx) {
      const onMajor = Math.abs(Math.round(px / effectiveMajorPx) * effectiveMajorPx - px) < 0.5;
      if (onMajor) continue;
      hLines.push(
        <line key={`mh-${px}`} x1={0} y1={px} x2={canvasWidth} y2={px}
          stroke="hsl(var(--border))" strokeOpacity={0.1} strokeWidth={1} />
      );
    }
  }

  // Major vertical lines + labels
  for (let i = 0; i * effectiveMajorPx < canvasWidth; i++) {
    const px = i * effectiveMajorPx;
    if (px === 0) continue; // skip origin line
    vLines.push(
      <line key={`Mv-${i}`} x1={px} y1={0} x2={px} y2={canvasHeight}
        stroke="hsl(var(--border))" strokeOpacity={0.3} strokeWidth={1} />
    );
    const label = Math.round(i * majorStep);
    topLabels.push(
      <div key={`tl-${i}`} className="absolute text-[9px] font-mono text-muted-foreground/60 select-none pointer-events-none"
        style={{ left: px, top: 2, transform: 'translateX(-50%)' }}>
        {label}{unitLabel}
      </div>
    );
  }
  // Major horizontal lines + labels
  for (let i = 0; i * effectiveMajorPx < canvasHeight; i++) {
    const px = i * effectiveMajorPx;
    if (px === 0) continue;
    hLines.push(
      <line key={`Mh-${i}`} x1={0} y1={px} x2={canvasWidth} y2={px}
        stroke="hsl(var(--border))" strokeOpacity={0.3} strokeWidth={1} />
    );
    const label = Math.round(i * majorStep);
    leftLabels.push(
      <div key={`ll-${i}`} className="absolute text-[9px] font-mono text-muted-foreground/60 select-none pointer-events-none"
        style={{ left: 2, top: px, transform: 'translateY(-50%)' }}>
        {label}{unitLabel}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-[0]">
      <svg width={canvasWidth} height={canvasHeight} className="absolute inset-0">
        {hLines}
        {vLines}
      </svg>
      {/* Ruler labels along top edge */}
      {topLabels}
      {/* Ruler labels along left edge */}
      {leftLabels}
      {/* Origin label */}
      <div className="absolute text-[9px] font-mono text-muted-foreground/60 select-none pointer-events-none"
        style={{ left: 2, top: 2 }}>
        0
      </div>
      {/* Snap highlight lines */}
      {snappedLines?.x != null && (
        <div className="absolute top-0 pointer-events-none z-[1]"
          style={{ left: snappedLines.x, width: 0, height: canvasHeight }}>
          <div className="w-px h-full bg-primary/40 animate-pulse" />
        </div>
      )}
      {snappedLines?.y != null && (
        <div className="absolute left-0 pointer-events-none z-[1]"
          style={{ top: snappedLines.y, width: canvasWidth, height: 0 }}>
          <div className="w-full h-px bg-primary/40 animate-pulse" />
        </div>
      )}
    </div>
  );
}

const objectColors: Record<string, string> = {
  tent: 'border-sky-400/40 bg-sky-50/30',
  stage: 'border-indigo-500/60 bg-indigo-950/40',
  podium: 'border-amber-600/50 bg-amber-900/20',
  round_table: 'border-amber-400/50 bg-amber-50/80',
  rect_table: 'border-amber-400/50 bg-amber-50/80',
  checkin: 'border-emerald-400/50 bg-emerald-50/40',
  bar: 'border-amber-600/50 bg-amber-900/20',
  vip_area: 'border-yellow-500/50 bg-yellow-50/40',
  chair: 'border-stone-400/30 bg-stone-100/20',
  photo_area: 'border-blue-400/40 bg-blue-50/30',
  registration: 'border-emerald-400/50 bg-emerald-50/40',
  aisle: 'border-border bg-muted/10',
  dance_floor: 'border-fuchsia-400/40 bg-fuchsia-50/30',
  catering: 'border-orange-400/50 bg-orange-50/40',
  signage: 'border-stone-400/40 bg-stone-100/30',
  custom_zone: 'border-border bg-muted/5',
};

const typeLabels: Record<string, string> = {
  tent: 'Tent', round_table: 'Round Table', rect_table: 'Rect Table', chair: 'Chair',
  stage: 'Stage', podium: 'Podium', checkin: 'Check-In', photo_area: 'Photo Area',
  registration: 'Registration', vip_area: 'VIP Area', aisle: 'Aisle',
  dance_floor: 'Dance Floor', catering: 'Catering', bar: 'Bar', signage: 'Signage',
  custom_zone: 'Zone',
};

const typeIcons: Record<string, React.ElementType> = {
  tent: Tent,
  stage: Mic,
  podium: Mic,
  round_table: CircleDot,
  rect_table: Square,
  checkin: CheckSquare,
  bar: Beer,
  vip_area: Star,
  chair: Square,
  photo_area: Camera,
  registration: CheckSquare,
  aisle: Footprints,
  dance_floor: Music,
  catering: UtensilsCrossed,
  signage: Type,
  custom_zone: LayoutGrid,
};

const typeHeaderColors: Record<string, string> = {
  tent: 'bg-sky-500/15 border-sky-400/40 text-sky-300',
  stage: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300',
  podium: 'bg-amber-600/15 border-amber-600/40 text-amber-400',
  round_table: 'bg-amber-400/15 border-amber-400/40 text-amber-300',
  rect_table: 'bg-amber-400/15 border-amber-400/40 text-amber-300',
  checkin: 'bg-emerald-400/15 border-emerald-400/40 text-emerald-300',
  bar: 'bg-amber-600/15 border-amber-600/40 text-amber-400',
  vip_area: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300',
  chair: 'bg-stone-400/15 border-stone-400/40 text-stone-300',
  photo_area: 'bg-blue-400/15 border-blue-400/40 text-blue-300',
  registration: 'bg-emerald-400/15 border-emerald-400/40 text-emerald-300',
  aisle: 'bg-muted/30 border-border text-muted-foreground',
  dance_floor: 'bg-fuchsia-400/15 border-fuchsia-400/40 text-fuchsia-300',
  catering: 'bg-orange-400/15 border-orange-400/40 text-orange-300',
  signage: 'bg-stone-400/15 border-stone-400/40 text-stone-300',
  custom_zone: 'bg-muted/30 border-border text-muted-foreground',
};

const objectPalette: { type: LayoutObjectType; label: string }[] = [
  { type: 'catering', label: 'Catering' },
  { type: 'signage', label: 'Signage' },
];

export default function EventLayout() {
  const { eventId } = useParams();
  const { showInspector } = useOutletContext<LayoutOutletContext>();
  const events = useEventStore((s) => s.events);
  const versions = useEventStore((s) => s.versions);
  const updateVersion = useEventStore((s) => s.updateVersion);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const updateLayoutObject = useEventStore((s) => s.updateLayoutObject);
  const addLayoutObject = useEventStore((s) => s.addLayoutObject);
  const removeLayoutObject = useEventStore((s) => s.removeLayoutObject);
  const renumberTablesByPosition = useEventStore((s) => s.renumberTablesByPosition);
  const guests = useEventStore((s) => s.guests);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);
  const relationshipGroups = useEventStore((s) => s.relationshipGroups);
  const relationshipMemberships = useEventStore((s) => s.relationshipMemberships);
  const getTableGuests = useEventStore((s) => s.getTableGuests);

  const event = events.find((e) => e.id === eventId);
  const versionId = event?.activeVersionId || '';
  const activeVersion = versions.find((v) => v.id === versionId);
  const objects = layoutObjects.filter((o) => o.versionId === versionId);

  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; handle: string; startX: number; startY: number; startW: number; startH: number; startObjX: number; startObjY: number } | null>(null);
  // Draw-to-place tool: click and drag on canvas to create an object at custom size
  const [drawingTool, setDrawingTool] = useState<LayoutObjectType | null>(null);
  const [drawing, setDrawing] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  // Venue image persisted on the active version so it survives navigation
  const venueImage = activeVersion?.venueImageData ?? null;
  const imageOpacity = activeVersion?.venueImageOpacity ?? 0.35;
  const setVenueImage = useCallback((url: string | null) => {
    if (versionId) updateVersion(versionId, { venueImageData: url ?? undefined });
  }, [versionId, updateVersion]);
  const setImageOpacity = useCallback((opacity: number) => {
    if (versionId) updateVersion(versionId, { venueImageOpacity: opacity });
  }, [versionId, updateVersion]);
  const [showSatelliteCapture, setShowSatelliteCapture] = useState(false);
  // Default: 1px ≈ 0.03m (~0.1ft), so 800px canvas ≈ 80ft wide
  // Persisted on version so it survives navigation
  const metersPerPixel = activeVersion?.metersPerPixel ?? 0.03048;
  const setMetersPerPixel = useCallback((mpp: number | null) => {
    if (versionId) updateVersion(versionId, { metersPerPixel: mpp ?? undefined });
  }, [versionId, updateVersion]);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const [snapMode, setSnapMode] = useState<'grid' | 'measured' | 'free'>('measured');
  const [canvasSize, setCanvasSizeLocal] = useState<{ width: number; height: number }>({
    width: activeVersion?.canvasWidth ?? 800,
    height: activeVersion?.canvasHeight ?? 600,
  });
  // Persist canvas size to version so it survives navigation
  const setCanvasSize = useCallback((size: { width: number; height: number }) => {
    setCanvasSizeLocal(size);
    if (versionId) updateVersion(versionId, { canvasWidth: size.width, canvasHeight: size.height });
  }, [versionId, updateVersion]);
  // Room bounds: the real-world dimensions of the physical space
  const [roomBounds, setRoomBounds] = useState<RoomBounds | null>(null);
  const [roomInputW, setRoomInputW] = useState('40');
  const [roomInputH, setRoomInputH] = useState('40');
  const [showRoomSetup, setShowRoomSetup] = useState(false);
  const [showCapCalc, setShowCapCalc] = useState(false);
  const [calcPresetIdx, setCalcPresetIdx] = useState(0);
  const [calcSpacing, setCalcSpacing] = useState('4');
  const [calcMargin, setCalcMargin] = useState('3');
  const [showMeasureGuides, setShowMeasureGuides] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [snappedGridLines, setSnappedGridLines] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeSnapGuides, setActiveSnapGuides] = useState<{ axis: 'x' | 'y'; position: number; type: 'edge' | 'center' | 'equal-spacing' }[]>([]);

  // Multi-select
  const selection = useSelectionManager();
  // Keep selectedId in sync with selection manager for backward compat
  const selectedId = selection.selectionCount === 1 ? [...selection.selectedIds][0] : null;
  const setSelectedId = (id: string | null) => {
    if (id) selection.selectOne(id);
    else selection.clearSelection();
  };

  // Undo/redo
  const undoRedo = useUndoRedo<LayoutObject[]>((snapshot) => {
    // Restore layout objects from snapshot — bulk replace for this version
    const currentVersionObjs = layoutObjects.filter((o) => o.versionId === versionId);
    currentVersionObjs.forEach((o) => removeLayoutObject(o.id));
    snapshot.forEach((o) => addLayoutObject(o));
  });
  // Push state on meaningful actions (add/remove/move complete)
  const pushUndoSnapshot = useCallback(() => {
    undoRedo.pushState([...objects]);
  }, [objects, undoRedo]);
  const snapHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tablePopoverId, setTablePopoverId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Convert to data URL so it persists in the store
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setVenueImage(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const analytics = event ? buildEventAnalytics({
    event,
    guests,
    versions,
    layoutObjects,
    seatingAssignments,
    seatingRules,
    relationshipGroups,
    relationshipMemberships,
  }) : null;

  const selected = objects.find((o) => o.id === selectedId);
  const selectedAssignments = selected ? seatingAssignments.filter((a) => a.tableId === selected.id && a.versionId === versionId) : [];

  // Snap modes:
  // - 'grid': coarse grid snap (1ft increments for layout alignment)
  // - 'measured': fine snap (0.1ft / ~1.2in for precision sizing)
  // - 'free': no snapping at all — pixel-perfect placement
  const snapIncrement = metersPerPixel && snapMode === 'measured'
    ? Math.max(1, Math.round(0.03048 / metersPerPixel)) // 0.1ft per step
    : snapMode === 'grid'
      ? (metersPerPixel ? Math.max(2, Math.round(0.3048 / metersPerPixel)) : 10) // 1ft per step
      : 1; // free mode

  const snapValue = (v: number) => {
    if (snapMode === 'free') return v; // no rounding at all
    return Math.round(v / snapIncrement) * snapIncrement;
  };

  // Compute room bounds in pixels for boundary drawing
  const roomBoundsPx = useMemo(() => {
    if (!roomBounds || !metersPerPixel) return null;
    return {
      width: Math.round(roomBounds.widthMeters / metersPerPixel),
      height: Math.round(roomBounds.heightMeters / metersPerPixel),
    };
  }, [roomBounds, metersPerPixel]);

  // Capacity calculator results
  const allPresets = [...tablePresets, ...supportPresets];
  const calcPreset = allPresets[calcPresetIdx] ?? tablePresets[0];
  const calcResult = useMemo(() => {
    if (!roomBounds) return null;
    const spacingM = userInputToMeters(parseFloat(calcSpacing) || 4, unitSystem);
    const marginM = userInputToMeters(parseFloat(calcMargin) || 3, unitSystem);
    return calculateTableFit(roomBounds, calcPreset, spacingM, marginM);
  }, [roomBounds, calcPreset, calcSpacing, calcMargin, unitSystem]);

  // Live measurement guides for dragging/selected object
  const measureGuides = useMemo(() => {
    if (!selected || !showMeasureGuides) return null;
    const cw = roomBoundsPx?.width ?? canvasSize.width;
    const ch = roomBoundsPx?.height ?? canvasSize.height;
    const edges = edgeDistances(selected.x, selected.y, selected.width, selected.height, cw, ch);
    const neighbors = nearestEdgeDistances(
      selected,
      objects.filter(o => o.id !== selected.id && o.visible),
    );
    return { edges, neighbors };
  }, [selected, objects, roomBoundsPx, canvasSize, showMeasureGuides]);

  const nearestNeighborDistance = selected
    ? objects
        .filter((o) => o.id !== selected.id)
        .map((o) => {
          const dx = (o.x + o.width / 2) - (selected.x + selected.width / 2);
          const dy = (o.y + o.height / 2) - (selected.y + selected.height / 2);
          return Math.sqrt(dx * dx + dy * dy);
        })
        .sort((a, b) => a - b)[0] ?? null
    : null;

  const handleMouseDown = useCallback((e: React.MouseEvent, obj: LayoutObject) => {
    if (obj.locked) return;
    e.stopPropagation();
    // Shift-click toggles multi-select; plain click selects one
    if (e.shiftKey) {
      selection.toggleSelect(obj.id);
    } else {
      selection.selectOne(obj.id);
    }
    pushUndoSnapshot();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragging({ id: obj.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  }, [selection, pushUndoSnapshot]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (resizing && canvasRef.current) {
      const dx = (e.clientX - resizing.startX) / zoom;
      const dy = (e.clientY - resizing.startY) / zoom;
      const handle = resizing.handle;
      let newW = resizing.startW;
      let newH = resizing.startH;
      let newX = resizing.startObjX;
      let newY = resizing.startObjY;

      if (handle.includes('e')) newW = Math.max(10, resizing.startW + dx);
      if (handle.includes('w')) { newW = Math.max(10, resizing.startW - dx); newX = resizing.startObjX + (resizing.startW - newW); }
      if (handle.includes('s')) newH = Math.max(10, resizing.startH + dy);
      if (handle.includes('n')) { newH = Math.max(10, resizing.startH - dy); newY = resizing.startObjY + (resizing.startH - newH); }

      updateLayoutObject(resizing.id, { width: snapValue(newW), height: snapValue(newH), x: snapValue(newX), y: snapValue(newY) });
      return;
    }
    if (!dragging || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - canvasRect.left - dragging.offsetX) / zoom;
    const y = (e.clientY - canvasRect.top - dragging.offsetY) / zoom;
    const snappedX = snapValue(x);
    const snappedY = snapValue(y);

    // Smart object-to-object snapping
    const draggedObj = objects.find((o) => o.id === dragging.id);
    if (draggedObj && snapMode !== 'free') {
      const movingRect = { ...draggedObj, x: snappedX, y: snappedY };
      const others = objects.filter((o) => o.id !== dragging.id);
      const snapResult = snapToObjects(movingRect, others, 8);
      const finalX = snapResult.guides.find((g) => g.axis === 'x')?.snappedValue ?? snappedX;
      const finalY = snapResult.guides.find((g) => g.axis === 'y')?.snappedValue ?? snappedY;
      updateLayoutObject(dragging.id, { x: finalX, y: finalY });
      setActiveSnapGuides(computeSnapGuides(snapResult));

      // Move contained objects if dragging a tent
      if (['tent', 'stage', 'dance_floor'].includes(draggedObj.type)) {
        const dx = finalX - draggedObj.x;
        const dy = finalY - draggedObj.y;
        if (dx !== 0 || dy !== 0) {
          const moved = moveContainedObjects(draggedObj, dx, dy, objects);
          moved.forEach((m) => updateLayoutObject(m.id, { x: m.x, y: m.y }));
        }
      }
    } else {
      updateLayoutObject(dragging.id, { x: snappedX, y: snappedY });
      setActiveSnapGuides([]);
    }
    // Show snap highlight on the grid line the object snapped to
    if (snapMode !== 'free' && showGrid && metersPerPixel) {
      setSnappedGridLines({ x: snappedX, y: snappedY });
      if (snapHighlightTimer.current) clearTimeout(snapHighlightTimer.current);
      snapHighlightTimer.current = setTimeout(() => setSnappedGridLines({ x: null, y: null }), 300);
    }
  }, [dragging, resizing, zoom, snapValue, updateLayoutObject, snapMode, showGrid, metersPerPixel, objects]);

  const handleMouseUp = useCallback(() => {
    if (dragging || resizing) {
      pushUndoSnapshot();
      // Re-number tables by spatial position after move/resize
      if (dragging) {
        const draggedObj = objects.find((o) => o.id === dragging.id);
        if (draggedObj && (draggedObj.type === 'round_table' || draggedObj.type === 'rect_table')) {
          requestAnimationFrame(() => renumberTablesByPosition(versionId));
        }
      }
    }
    setDragging(null);
    setResizing(null);
    setSnappedGridLines({ x: null, y: null });
    setActiveSnapGuides([]);
    // Finish drawing: create the object
    if (drawing && drawingTool && canvasRef.current) {
      const x = Math.min(drawing.startX, drawing.currentX);
      const y = Math.min(drawing.startY, drawing.currentY);
      const w = Math.abs(drawing.currentX - drawing.startX);
      const h = Math.abs(drawing.currentY - drawing.startY);
      if (w > 5 && h > 5) {
        const id = `lo-${crypto.randomUUID()}`;
        addLayoutObject({
          id,
          versionId,
          type: drawingTool,
          name: typeLabels[drawingTool] ?? drawingTool,
          x: snapValue(x),
          y: snapValue(y),
          width: snapValue(w),
          height: snapValue(h),
          rotation: 0,
          capacity: 0,
          notes: '',
          category: 'layout',
          locked: false,
          visible: true,
          zIndex: objects.length,
        });
        setSelectedId(id);
      }
      setDrawing(null);
      setDrawingTool(null);
    }
  }, [drawing, drawingTool, versionId, objects, addLayoutObject, snapValue, dragging, pushUndoSnapshot, renumberTablesByPosition]);

  // Canvas mousedown for drawing mode
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (drawingTool && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      setDrawing({ startX: x, startY: y, currentX: x, currentY: y });
      setSelectedId(null);
      e.preventDefault();
      return;
    }
    setSelectedId(null);
  }, [drawingTool, zoom]);

  // Canvas mousemove for drawing mode
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (drawing && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / zoom;
      const y = (e.clientY - rect.top) / zoom;
      setDrawing((prev) => prev ? { ...prev, currentX: x, currentY: y } : null);
      return;
    }
    handleMouseMove(e);
  }, [drawing, zoom, handleMouseMove]);

  // Window-level mouse handlers during drag/resize to prevent losing the drag
  // when the cursor passes over child elements that stop propagation.
  useEffect(() => {
    if (!dragging && !resizing) return;
    const onMove = (e: MouseEvent) => {
      handleCanvasMouseMove(e as unknown as React.MouseEvent);
    };
    const onUp = () => {
      handleMouseUp();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, resizing, handleCanvasMouseMove, handleMouseUp]);

  // Keyboard shortcuts: Delete/Backspace to remove, Escape to cancel drawing tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawingTool) {
          setDrawingTool(null);
          setDrawing(null);
          return;
        }
        if (selectedId) {
          setSelectedId(null);
          return;
        }
      }
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        const obj = layoutObjects.find((o) => o.id === selectedId);
        if (obj?.locked) return;
        const wasTable = obj?.type === 'round_table' || obj?.type === 'rect_table';
        removeLayoutObject(selectedId);
        setSelectedId(null);
        if (wasTable) {
          requestAnimationFrame(() => renumberTablesByPosition(versionId));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, layoutObjects, removeLayoutObject, drawingTool, renumberTablesByPosition, versionId]);

  const handleAddObject = (type: LayoutObjectType, preset?: ObjectPreset) => {
    const id = `lo-${crypto.randomUUID()}`;

    const fallbackSizes: Partial<Record<LayoutObjectType, { w: number; h: number }>> = {
      round_table: { w: 80, h: 80 },
      rect_table: { w: 120, h: 40 },
      stage: { w: 180, h: 90 },
      podium: { w: 40, h: 40 },
      tent: { w: 240, h: 180 },
      checkin: { w: 120, h: 40 },
      bar: { w: 120, h: 40 },
      chair: { w: 28, h: 28 },
      dance_floor: { w: 180, h: 180 },
      signage: { w: 40, h: 24 },
      vip_area: { w: 160, h: 100 },
      catering: { w: 120, h: 60 },
    };

    const fallback = fallbackSizes[type] ?? { w: 60, h: 40 };
    const w = preset ? metersToPixels(preset.widthMeters, metersPerPixel, fallback.w) : fallback.w;
    const h = preset ? metersToPixels(preset.heightMeters, metersPerPixel, fallback.h) : fallback.h;
    const capacity = preset?.capacity ?? (type.includes('table') ? 8 : 0);

    const existing = objects.length;
    const column = existing % 4;
    const row = Math.floor(existing / 4);

    // Place relative to current scroll position so objects appear in the visible viewport
    const scrollLeft = canvasRef.current?.scrollLeft ?? 0;
    const scrollTop = canvasRef.current?.scrollTop ?? 0;
    const viewX = scrollLeft / zoom;
    const viewY = scrollTop / zoom;

    // Structural objects (tent, stage, dance_floor) get z-index 0 so tables
    // render on top and stay clickable. Tables start at z-index 100+.
    const isStructural = ['tent', 'stage', 'dance_floor', 'bar_area', 'vip_area'].includes(type);
    const baseZ = isStructural ? 0 : 100 + objects.length;

    // Auto-assign table number for table types (sequential, no gaps)
    const isTable = type === 'round_table' || type === 'rect_table';
    let tableNumber: number | undefined;
    if (isTable) {
      const existingTableCount = objects.filter(
        (o) => o.type === 'round_table' || o.type === 'rect_table',
      ).length;
      tableNumber = existingTableCount + 1;
    }

    const tableName = isTable && tableNumber
      ? `Table ${tableNumber}`
      : (preset?.label ?? typeLabels[type]);

    addLayoutObject({
      id,
      versionId,
      type,
      name: tableName,
      tableNumber,
      x: snapValue(viewX + 60 + column * 140),
      y: snapValue(viewY + 60 + row * 110),
      width: w,
      height: h,
      rotation: 0,
      capacity,
      notes: '',
      category: type.includes('table') ? 'seating' : 'layout',
      locked: false,
      visible: true,
      zIndex: baseZ,
    });

    // Renumber all tables by spatial position after adding
    if (isTable) {
      requestAnimationFrame(() => renumberTablesByPosition(versionId));
    }
  };

  const handleBringToFront = useCallback((id: string) => {
    const maxZ = Math.max(...objects.map(o => o.zIndex), 0);
    updateLayoutObject(id, { zIndex: maxZ + 1 });
  }, [objects, updateLayoutObject]);

  const handleSendToBack = useCallback((id: string) => {
    const minZ = Math.min(...objects.map(o => o.zIndex), 0);
    updateLayoutObject(id, { zIndex: minZ - 1 });
  }, [objects, updateLayoutObject]);

  // Auto-arrange: snap all tables into a clean evenly-spaced grid
  const autoArrangeTables = useCallback(() => {
    const tables = objects.filter((o) => ['round_table', 'rect_table'].includes(o.type));
    if (tables.length === 0) return;

    // Determine the bounding area (room bounds or canvas)
    const areaW = roomBoundsPx?.width ?? canvasSize.width;
    const areaH = roomBoundsPx?.height ?? canvasSize.height;

    // Find the largest table dimensions to standardise spacing
    const maxW = Math.max(...tables.map((t) => t.width));
    const maxH = Math.max(...tables.map((t) => t.height));

    // Compute spacing: at least 30% of table size, minimum 20px
    const spacingX = Math.max(20, Math.round(maxW * 0.5));
    const spacingY = Math.max(20, Math.round(maxH * 0.5));

    // Margin from edges
    const marginX = Math.max(30, spacingX);
    const marginY = Math.max(30, spacingY);

    // Cell size (table + spacing)
    const cellW = maxW + spacingX;
    const cellH = maxH + spacingY;

    // How many columns fit?
    const usableW = areaW - 2 * marginX;
    const cols = Math.max(1, Math.floor(usableW / cellW));

    // Center the grid horizontally
    const gridTotalW = cols * cellW - spacingX;
    const offsetX = marginX + Math.max(0, (usableW - gridTotalW) / 2);

    tables.forEach((table, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = snapValue(offsetX + col * cellW + (maxW - table.width) / 2);
      const y = snapValue(marginY + row * cellH + (maxH - table.height) / 2);
      updateLayoutObject(table.id, { x, y });
    });
  }, [objects, roomBoundsPx, canvasSize, snapValue, updateLayoutObject]);

  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

  return (
    <div className="flex h-screen">
      {/* Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar — Row 1: View & map controls */}
        <div className="border-b border-border bg-card/50">
          <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(z + 0.1, 3))}><ZoomIn className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(z - 0.1, 0.3))}><ZoomOut className="w-3.5 h-3.5" /></Button>
            <span className="text-[10px] font-mono text-muted-foreground px-1">{Math.round(zoom * 100)}%</span>
            <div className="w-px h-5 bg-border mx-0.5" />
            <Button variant={showGrid ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7" onClick={() => setShowGrid(!showGrid)}><Grid3X3 className="w-3.5 h-3.5" /></Button>
            <div className="w-px h-5 bg-border mx-0.5" />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <Button variant={venueImage ? 'secondary' : 'ghost'} size="sm" className="text-[11px] h-7 px-2 gap-1" onClick={() => fileInputRef.current?.click()}>
              <ImageIcon className="w-3 h-3" />{venueImage ? 'Replace' : 'Upload Map'}
            </Button>
            <Button variant="ghost" size="sm" className="text-[11px] h-7 px-2 gap-1" onClick={() => setShowSatelliteCapture(true)}>
              <Satellite className="w-3 h-3" />Satellite
            </Button>
            {venueImage && (
              <>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">Opacity</span>
                  <input type="range" min="0.05" max="1" step="0.05" value={imageOpacity} onChange={(e) => setImageOpacity(Number(e.target.value))} className="w-14 h-1 accent-primary" />
                  <span className="text-[10px] font-mono text-muted-foreground w-5">{Math.round(imageOpacity * 100)}%</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { if (venueImage && venueImage.startsWith('blob:')) URL.revokeObjectURL(venueImage); setVenueImage(null); }}>
                  <X className="w-3 h-3 text-muted-foreground" />
                </Button>
              </>
            )}
            <div className="w-px h-5 bg-border mx-0.5" />
            <button onClick={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')} className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground text-[10px] font-medium uppercase tracking-wide">
              {unitSystem === 'imperial' ? 'ft' : 'm'}
            </button>
            {metersPerPixel && <span className="text-[10px] font-mono text-muted-foreground">{formatScale(metersPerPixel, unitSystem)}</span>}
            <div className="w-px h-5 bg-border mx-0.5" />
            <Button variant={snapMode !== 'grid' ? 'secondary' : 'ghost'} size="sm" className="text-[11px] h-7 px-2 gap-1" onClick={() => setSnapMode((mode) => mode === 'grid' ? 'measured' : mode === 'measured' ? 'free' : 'grid')}>
              <Ruler className="w-3 h-3" />{snapMode === 'grid' ? 'Snap 1ft' : snapMode === 'measured' ? 'Snap 0.1ft' : 'Free'}
            </Button>
            <Button variant={showMeasureGuides ? 'secondary' : 'ghost'} size="sm" className="text-[11px] h-7 px-2 gap-1" onClick={() => setShowMeasureGuides(!showMeasureGuides)}>
              <Move className="w-3 h-3" />Guides
            </Button>
            <div className="w-px h-5 bg-border mx-0.5" />
            <Button variant={roomBounds ? 'secondary' : 'ghost'} size="sm" className="text-[11px] h-7 px-2 gap-1" onClick={() => setShowRoomSetup(!showRoomSetup)}>
              <Box className="w-3 h-3" />{roomBounds ? `${formatWithUnit(metersToUserUnit(roomBounds.widthMeters, unitSystem), unitSystem)} x ${formatWithUnit(metersToUserUnit(roomBounds.heightMeters, unitSystem), unitSystem)}` : 'Room Size'}
            </Button>
            <Button variant={showCapCalc ? 'secondary' : 'ghost'} size="sm" className="text-[11px] h-7 px-2 gap-1" onClick={() => setShowCapCalc(!showCapCalc)}>
              <Calculator className="w-3 h-3" />Fit Calc
            </Button>
            <ArrangementPanel
              tables={objects.filter((o) => ['round_table', 'rect_table'].includes(o.type))}
              boundsWidth={roomBoundsPx?.width ?? canvasSize.width}
              boundsHeight={roomBoundsPx?.height ?? canvasSize.height}
              onArrange={(results) => {
                pushUndoSnapshot();
                results.forEach((r) => updateLayoutObject(r.id, { x: snapValue(r.x), y: snapValue(r.y) }));
              }}
            />
            <div className="w-px h-5 bg-border mx-0.5" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => undoRedo.undo()} disabled={!undoRedo.canUndo} title="Undo (Ctrl+Z)">
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => undoRedo.redo()} disabled={!undoRedo.canRedo} title="Redo (Ctrl+Shift+Z)">
              <Redo2 className="w-3.5 h-3.5" />
            </Button>
            <div className="ml-auto"><SaveIndicator /></div>
          </div>

          {/* Row 2: Add objects — categorized toolbar */}
          <div className="border-t border-border/50">
            <div className="flex items-center gap-1 px-3 py-1.5"
              style={{ background: 'linear-gradient(90deg, hsla(152,68%,42%,0.06) 0%, hsla(84,60%,48%,0.04) 100%)' }}
            >
              {/* Category buttons */}
              {([
                { key: 'tables' as const, label: 'Tables', icon: CircleDot },
                { key: 'structures' as const, label: 'Structures', icon: Tent },
                { key: 'stations' as const, label: 'Stations', icon: Coffee },
                { key: 'draw' as const, label: 'Draw', icon: PenTool },
              ]).map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  variant={activeCategory === key || (key === 'draw' && drawingTool != null) ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'text-[11px] h-7 px-2.5 gap-1.5',
                    activeCategory === key && 'ring-1 ring-primary/50',
                    key === 'draw' && drawingTool != null && activeCategory !== 'draw' && 'ring-1 ring-primary',
                  )}
                  onClick={() => {
                    if (key === 'draw') {
                      setActiveCategory(activeCategory === 'draw' ? null : 'draw');
                    } else {
                      if (drawingTool) setDrawingTool(null);
                      setActiveCategory(activeCategory === key ? null : key);
                    }
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {key !== 'draw' && <ChevronDown className={cn('w-3 h-3 transition-transform', activeCategory === key && 'rotate-180')} />}
                </Button>
              ))}

              {/* Draw mode indicator */}
              {drawingTool && (
                <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/30">
                  <PenTool className="w-3 h-3 text-primary" />
                  <span className="text-[11px] font-medium text-primary">
                    Drawing: {drawableTypes.find(d => d.type === drawingTool)?.label}
                  </span>
                  <span className="text-[10px] text-primary/70 animate-pulse">— click &amp; drag on canvas</span>
                  <button onClick={() => setDrawingTool(null)} className="ml-1 rounded hover:bg-primary/20 p-0.5">
                    <X className="w-3 h-3 text-primary" />
                  </button>
                </div>
              )}
            </div>

            {/* Expanded category panel */}
            {activeCategory != null && activeCategory !== 'draw' && (
              <div className="border-t border-border/40 bg-card/80 px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  {activeCategory === 'tables' && tablePresets.map((preset) => {
                    const isRound = preset.type === 'round_table';
                    return (
                      <button
                        key={preset.label}
                        onClick={() => handleAddObject(preset.type, preset)}
                        className="group flex flex-col items-center justify-center w-16 h-12 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent hover:border-border transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-center h-5">
                          {isRound
                            ? <Circle className="w-4 h-4 text-amber-400/80 group-hover:text-amber-300" />
                            : <RectangleHorizontal className="w-5 h-3.5 text-amber-400/80 group-hover:text-amber-300" />
                          }
                        </div>
                        <span className="text-[9px] text-muted-foreground group-hover:text-foreground leading-tight mt-0.5">
                          {isRound ? 'Round' : 'Rect'} {preset.capacity}
                        </span>
                      </button>
                    );
                  })}

                  {activeCategory === 'structures' && structurePresets.map((preset) => {
                    const Icon = typeIcons[preset.type] || Square;
                    return (
                      <button
                        key={preset.label}
                        onClick={() => handleAddObject(preset.type, preset)}
                        className="group flex flex-col items-center justify-center w-16 h-12 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent hover:border-border transition-colors cursor-pointer"
                      >
                        <Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                        <span className="text-[9px] text-muted-foreground group-hover:text-foreground leading-tight mt-0.5">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}

                  {activeCategory === 'stations' && stationPresets.map((preset) => {
                    const Icon = typeIcons[preset.type] || Square;
                    return (
                      <button
                        key={preset.label}
                        onClick={() => handleAddObject(preset.type, preset)}
                        className="group flex flex-col items-center justify-center w-16 h-12 rounded-lg border border-border/60 bg-muted/20 hover:bg-accent hover:border-border transition-colors cursor-pointer"
                      >
                        <Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
                        <span className="text-[9px] text-muted-foreground group-hover:text-foreground leading-tight mt-0.5">
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Draw mode panel */}
            {activeCategory === 'draw' && (
              <div className="border-t border-border/40 bg-card/80 px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  {drawableTypes.map((item) => {
                    const Icon = typeIcons[item.type] || Square;
                    const isActive = drawingTool === item.type;
                    return (
                      <button
                        key={item.type}
                        onClick={() => setDrawingTool(isActive ? null : item.type)}
                        className={cn(
                          'group flex flex-col items-center justify-center w-16 h-12 rounded-lg border transition-colors cursor-pointer',
                          isActive
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/50'
                            : 'border-border/60 bg-muted/20 hover:bg-accent hover:border-border',
                        )}
                      >
                        <Icon className={cn('w-4 h-4', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        <span className={cn('text-[9px] leading-tight mt-0.5', isActive ? 'text-primary font-medium' : 'text-muted-foreground group-hover:text-foreground')}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {analytics && (
          <div className="border-b border-border bg-card/30 px-4 py-3 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground"><Sparkles className="w-3 h-3" /> Readiness</div>
              <div className="text-lg font-semibold text-foreground mt-1">{analytics.readinessScore}</div>
              <div className="text-xs text-muted-foreground">{analytics.progressLabel}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground"><Users className="w-3 h-3" /> Seating coverage</div>
              <div className="text-lg font-semibold text-foreground mt-1">{analytics.assignedConfirmed}/{analytics.confirmedGuests.length}</div>
              <div className="text-xs text-muted-foreground">Confirmed guests seated</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Front tables</div>
              <div className="text-lg font-semibold text-foreground mt-1">{analytics.frontTables.length}</div>
              <div className="text-xs text-muted-foreground">High-visibility tables near stage</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">FOH coverage</div>
              <div className="text-lg font-semibold text-foreground mt-1">{analytics.frontOfHouseReady ? 'Ready' : 'Missing'}</div>
              <div className="text-xs text-muted-foreground">Check-in / registration footprint</div>
            </div>
          </div>
        )}

        {/* Room Setup Panel */}
        {showRoomSetup && (
          <div className="border-b border-border bg-card/40 px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><Box className="w-3.5 h-3.5" /> Define Room / Space Dimensions</div>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-muted-foreground">Width</label>
                <input
                  className="w-16 px-1.5 py-1 text-xs bg-muted border border-border rounded text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  type="number" min="1" step="1" value={roomInputW}
                  onChange={(e) => setRoomInputW(e.target.value)}
                />
                <span className="text-[10px] text-muted-foreground">{unitSystem === 'imperial' ? 'ft' : 'm'}</span>
              </div>
              <X className="w-3 h-3 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-muted-foreground">Length</label>
                <input
                  className="w-16 px-1.5 py-1 text-xs bg-muted border border-border rounded text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  type="number" min="1" step="1" value={roomInputH}
                  onChange={(e) => setRoomInputH(e.target.value)}
                />
                <span className="text-[10px] text-muted-foreground">{unitSystem === 'imperial' ? 'ft' : 'm'}</span>
              </div>
              <Button size="sm" className="text-xs h-7 px-3" onClick={() => {
                const w = parseFloat(roomInputW) || 40;
                const h = parseFloat(roomInputH) || 40;
                const wMeters = userInputToMeters(w, unitSystem);
                const hMeters = userInputToMeters(h, unitSystem);
                setRoomBounds({ widthMeters: wMeters, heightMeters: hMeters });
                // Auto-set metersPerPixel if not set from satellite
                if (!metersPerPixel) {
                  const maxCanvasPx = 800;
                  const mpp = Math.max(wMeters, hMeters) / maxCanvasPx;
                  setMetersPerPixel(mpp);
                  setCanvasSize({
                    width: Math.round(wMeters / mpp),
                    height: Math.round(hMeters / mpp),
                  });
                }
                setShowRoomSetup(false);
              }}>
                Apply Room Size
              </Button>
              {roomBounds && (
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2 text-destructive" onClick={() => { setRoomBounds(null); setShowRoomSetup(false); }}>
                  Clear
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Enter real-world dimensions. This defines the boundary on your canvas so you can see exactly what fits.</p>
          </div>
        )}

        {/* Capacity Calculator Panel */}
        {showCapCalc && roomBounds && (
          <div className="border-b border-border bg-card/40 px-4 py-3">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><Calculator className="w-3.5 h-3.5" /> Table Fit Calculator</div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-muted-foreground">Table type</label>
                  <select
                    className="px-1.5 py-1 text-xs bg-muted border border-border rounded text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    value={calcPresetIdx}
                    onChange={(e) => setCalcPresetIdx(Number(e.target.value))}
                  >
                    {allPresets.map((p, i) => (
                      <option key={i} value={i}>{p.label} ({formatWithUnit(metersToUserUnit(p.widthMeters, unitSystem), unitSystem)} x {formatWithUnit(metersToUserUnit(p.heightMeters, unitSystem), unitSystem)})</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-muted-foreground">Aisle spacing</label>
                    <input className="w-12 px-1 py-0.5 text-xs bg-muted border border-border rounded font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" min="0" step="0.5" value={calcSpacing} onChange={(e) => setCalcSpacing(e.target.value)} />
                    <span className="text-[10px] text-muted-foreground">{unitSystem === 'imperial' ? 'ft' : 'm'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="text-[10px] text-muted-foreground">Wall margin</label>
                    <input className="w-12 px-1 py-0.5 text-xs bg-muted border border-border rounded font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" min="0" step="0.5" value={calcMargin} onChange={(e) => setCalcMargin(e.target.value)} />
                    <span className="text-[10px] text-muted-foreground">{unitSystem === 'imperial' ? 'ft' : 'm'}</span>
                  </div>
                </div>
              </div>
              {calcResult && (
                <div className="grid grid-cols-4 gap-2 flex-1 min-w-[320px]">
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tables fit</div>
                    <div className="text-lg font-bold text-foreground">{calcResult.total}</div>
                    <div className="text-[10px] text-muted-foreground">{calcResult.cols} cols x {calcResult.rows} rows</div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total seats</div>
                    <div className="text-lg font-bold text-foreground">{calcResult.totalCapacity}</div>
                    <div className="text-[10px] text-muted-foreground">{calcPreset.capacity ?? 0} per table</div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Table area</div>
                    <div className="text-lg font-bold text-foreground">{formatWithUnit(metersToUserUnit(calcResult.usedArea, unitSystem), unitSystem).replace('ft', 'ft²').replace('m', 'm²')}</div>
                    <div className="text-[10px] text-muted-foreground">of {formatWithUnit(metersToUserUnit(calcResult.totalArea, unitSystem), unitSystem).replace('ft', 'ft²').replace('m', 'm²')}</div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Utilization</div>
                    <div className="text-lg font-bold text-foreground">{calcResult.utilization.toFixed(0)}%</div>
                    <div className="text-[10px] text-muted-foreground">floor coverage</div>
                  </div>
                </div>
              )}
              {!roomBounds && (
                <p className="text-xs text-muted-foreground">Set room dimensions first to calculate table capacity.</p>
              )}
            </div>
          </div>
        )}
        {showCapCalc && !roomBounds && (
          <div className="border-b border-border bg-card/40 px-4 py-3">
            <p className="text-xs text-muted-foreground flex items-center gap-2"><Calculator className="w-3.5 h-3.5" /> Set room dimensions first (click "Set Room Size" above) to calculate how many tables fit.</p>
          </div>
        )}

        <div className="border-b border-border bg-card/20 px-4 py-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><WandSparkles className="w-3.5 h-3.5" /> {roomBounds ? `Room: ${formatWithUnit(metersToUserUnit(roomBounds.widthMeters, unitSystem), unitSystem)} x ${formatWithUnit(metersToUserUnit(roomBounds.heightMeters, unitSystem), unitSystem)} — drag objects to see live measurements` : 'Set room size for precise measurements, or use satellite capture for scale'}</div>
          <div className="font-mono">{selected ? `${objects.length} objects` : 'select an object to inspect spacing'}</div>
        </div>

        {/* Canvas area */}
        <div
          ref={canvasRef}
          className={cn('flex-1 overflow-auto relative bg-background', drawingTool && 'cursor-crosshair')}
          onMouseMove={handleCanvasMouseMove}
          onMouseDown={handleCanvasMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return; // only zoom on Ctrl/Cmd + scroll
            e.preventDefault();
            const delta = -e.deltaY * 0.001;
            setZoom((z) => Math.max(0.2, Math.min(4.0, z + delta * z)));
          }}
        >
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: canvasSize.width, height: canvasSize.height, position: 'relative' }}
            className="transition-transform"
          >
            {/* Measurement-based grid overlay */}
            {showGrid && metersPerPixel && (
              <GridOverlay
                metersPerPixel={metersPerPixel}
                unitSystem={unitSystem}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
                zoom={zoom}
                snappedLines={(dragging || resizing) ? snappedGridLines : undefined}
              />
            )}
            {/* Room boundary outline */}
            {roomBoundsPx && (
              <>
                <div
                  className="absolute border-2 border-dashed border-blue-500/40 pointer-events-none z-[1]"
                  style={{ left: 0, top: 0, width: roomBoundsPx.width, height: roomBoundsPx.height }}
                />
                {/* Room dimension labels */}
                <div className="absolute pointer-events-none z-[2] flex items-center justify-center" style={{ left: 0, top: -22, width: roomBoundsPx.width, height: 20 }}>
                  <div className="flex items-center gap-1">
                    <ArrowLeftRight className="w-3 h-3 text-blue-400/70" />
                    <span className="text-[10px] font-mono font-semibold text-blue-400/90 bg-card/80 px-1.5 py-0.5 rounded border border-blue-400/30">
                      {formatWithUnit(metersToUserUnit(roomBounds!.widthMeters, unitSystem), unitSystem)}
                    </span>
                  </div>
                </div>
                <div className="absolute pointer-events-none z-[2] flex items-center justify-center" style={{ left: -8, top: 0, width: 20, height: roomBoundsPx.height, transform: 'translateX(-100%)' }}>
                  <div className="flex items-center gap-1 -rotate-90">
                    <ArrowUpDown className="w-3 h-3 text-blue-400/70" />
                    <span className="text-[10px] font-mono font-semibold text-blue-400/90 bg-card/80 px-1.5 py-0.5 rounded border border-blue-400/30 whitespace-nowrap">
                      {formatWithUnit(metersToUserUnit(roomBounds!.heightMeters, unitSystem), unitSystem)}
                    </span>
                  </div>
                </div>
                {/* Corner labels */}
                <div className="absolute text-[8px] font-mono text-blue-400/60 pointer-events-none z-[2]" style={{ left: 2, top: roomBoundsPx.height + 2 }}>
                  {formatDistance(roomBounds!.widthMeters * roomBounds!.heightMeters, unitSystem).replace('ft', 'ft²').replace('m', 'm²')} total
                </div>
              </>
            )}
            {/* Venue background image */}
            {venueImage && (
              <img
                src={venueImage}
                alt="Venue floor plan"
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                style={{ opacity: imageOpacity }}
                draggable={false}
              />
            )}
            {/* Grid overlay on top of image is handled by GridOverlay above */}

            {/* Live measurement guides — ONLY when selected and idle (not during drag/resize) */}
            {selected && showMeasureGuides && measureGuides && metersPerPixel && !dragging && !resizing && (
              <>
                {/* Edge distance guides: hidden during resize, shown during drag only when close to edge (<50px) */}
                {!resizing && (() => {
                  const edgeThreshold = dragging ? 50 : Infinity; // when dragging, only show if <50px; when idle/selected, show all
                  return (
                    <>
                      {/* Distance to left edge */}
                      {measureGuides.edges.left > 10 && measureGuides.edges.left < edgeThreshold && (
                        <div className="absolute pointer-events-none z-[50]" style={{ left: 0, top: selected.y + selected.height / 2, width: selected.x, height: 0 }}>
                          <div className="border-t border-dashed border-emerald-400/60 w-full" />
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                            {formatDimension(measureGuides.edges.left, metersPerPixel, unitSystem)}
                          </div>
                        </div>
                      )}
                      {/* Distance to right edge */}
                      {measureGuides.edges.right > 10 && measureGuides.edges.right < edgeThreshold && (
                        <div className="absolute pointer-events-none z-[50]" style={{ left: selected.x + selected.width, top: selected.y + selected.height / 2, width: measureGuides.edges.right, height: 0 }}>
                          <div className="border-t border-dashed border-emerald-400/60 w-full" />
                          <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                            {formatDimension(measureGuides.edges.right, metersPerPixel, unitSystem)}
                          </div>
                        </div>
                      )}
                      {/* Distance to top edge */}
                      {measureGuides.edges.top > 10 && measureGuides.edges.top < edgeThreshold && (
                        <div className="absolute pointer-events-none z-[50]" style={{ left: selected.x + selected.width / 2, top: 0, width: 0, height: selected.y }}>
                          <div className="border-l border-dashed border-emerald-400/60 h-full" />
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                            {formatDimension(measureGuides.edges.top, metersPerPixel, unitSystem)}
                          </div>
                        </div>
                      )}
                      {/* Distance to bottom edge */}
                      {measureGuides.edges.bottom > 10 && measureGuides.edges.bottom < edgeThreshold && (
                        <div className="absolute pointer-events-none z-[50]" style={{ left: selected.x + selected.width / 2, top: selected.y + selected.height, width: 0, height: measureGuides.edges.bottom }}>
                          <div className="border-l border-dashed border-emerald-400/60 h-full" />
                          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                            {formatDimension(measureGuides.edges.bottom, metersPerPixel, unitSystem)}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
                {/* Alignment guides */}
                {measureGuides.neighbors.alignments.map((a, i) => (
                  <div
                    key={`align-${i}`}
                    className="absolute pointer-events-none z-[49]"
                    style={a.axis === 'v'
                      ? { left: a.position, top: 0, width: 0, height: canvasSize.height, borderLeft: '1px solid rgba(168,85,247,0.4)' }
                      : { left: 0, top: a.position, width: canvasSize.width, height: 0, borderTop: '1px solid rgba(168,85,247,0.4)' }
                    }
                  />
                ))}
                {/* Nearest neighbor distance line */}
                {measureGuides.neighbors.nearest && (() => {
                  const n = measureGuides.neighbors.nearest;
                  const neighbor = objects.find(o => o.id === n.id);
                  if (!neighbor) return null;
                  const sCX = selected.x + selected.width / 2;
                  const sCY = selected.y + selected.height / 2;
                  const nCX = neighbor.x + neighbor.width / 2;
                  const nCY = neighbor.y + neighbor.height / 2;
                  // Draw a line between the two nearest edges
                  let x1: number, y1: number, x2: number, y2: number;
                  switch (n.direction) {
                    case 'right': x1 = selected.x + selected.width; y1 = sCY; x2 = neighbor.x; y2 = sCY; break;
                    case 'left': x1 = neighbor.x + neighbor.width; y1 = sCY; x2 = selected.x; y2 = sCY; break;
                    case 'bottom': x1 = sCX; y1 = selected.y + selected.height; x2 = sCX; y2 = neighbor.y; break;
                    case 'top': x1 = sCX; y1 = neighbor.y + neighbor.height; x2 = sCX; y2 = selected.y; break;
                    default: return null;
                  }
                  const isHoriz = n.direction === 'left' || n.direction === 'right';
                  return (
                    <div
                      className="absolute pointer-events-none z-[51]"
                      style={isHoriz
                        ? { left: Math.min(x1, x2), top: y1 - 0.5, width: Math.abs(x2 - x1), height: 1, background: 'rgba(251,146,60,0.7)' }
                        : { left: x1 - 0.5, top: Math.min(y1, y2), width: 1, height: Math.abs(y2 - y1), background: 'rgba(251,146,60,0.7)' }
                      }
                    >
                      <div className={cn(
                        "absolute text-[9px] font-mono font-semibold text-orange-400 bg-card/95 px-1 rounded border border-orange-400/40 whitespace-nowrap",
                        isHoriz ? "top-[-18px] left-1/2 -translate-x-1/2" : "left-2 top-1/2 -translate-y-1/2"
                      )}>
                        {formatDimension(n.distance, metersPerPixel, unitSystem)}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
            {objects.filter((o) => o.visible).sort((a, b) => a.zIndex - b.zIndex).map((obj) => {
              const isTable = ['round_table', 'rect_table'].includes(obj.type);
              const tableGuests = isTable ? getTableGuests(obj.id, versionId) : [];
              const isSelected = selection.isSelected(obj.id);
              const isObjDragging = dragging?.id === obj.id;
              const isObjHovered = hoveredId === obj.id && !isSelected;

              const formatDim = (px: number) => formatDimension(px, metersPerPixel, unitSystem);

              const resizeHandles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
              const handleCursors: Record<string, string> = {
                n: 'cursor-n-resize', ne: 'cursor-ne-resize', e: 'cursor-e-resize', se: 'cursor-se-resize',
                s: 'cursor-s-resize', sw: 'cursor-sw-resize', w: 'cursor-w-resize', nw: 'cursor-nw-resize',
              };
              const handlePositions: Record<string, string> = {
                n: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
                ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2',
                e: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2',
                se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2',
                s: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
                sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2',
                w: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2',
                nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2',
              };

              const objectEl = (
                <div
                  key={obj.id}
                  className={cn(
                    'absolute border-2 flex flex-col items-center justify-center cursor-move select-none overflow-visible',
                    'transition-all duration-150 ease-out',
                    objectColors[obj.type] || 'border-border bg-muted/10',
                    obj.type === 'round_table' && 'rounded-full',
                    obj.type === 'tent' && 'border-dashed',
                    isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                    isObjHovered && !isObjDragging && 'ring-1 ring-primary/40 brightness-110',
                    isObjDragging && 'opacity-80 scale-[1.02]',
                    obj.locked && 'cursor-not-allowed opacity-70',
                  )}
                  style={{
                    left: obj.x, top: obj.y, width: obj.width, height: obj.height,
                    zIndex: obj.zIndex,
                    transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                    boxShadow: isObjDragging
                      ? '0 12px 32px rgba(0,0,0,0.2), 0 4px 8px rgba(0,0,0,0.1)'
                      : isSelected
                        ? '0 4px 12px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08)'
                        : isObjHovered
                          ? '0 4px 12px rgba(0,0,0,0.12)'
                          : '0 1px 4px rgba(0,0,0,0.08), 0 0.5px 1px rgba(0,0,0,0.05)',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, obj)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) selection.toggleSelect(obj.id);
                    else selection.selectOne(obj.id);
                  }}
                  onDoubleClick={(e) => {
                    if (isTable) {
                      e.stopPropagation();
                      setTablePopoverId(tablePopoverId === obj.id ? null : obj.id);
                    }
                  }}
                  onMouseEnter={() => setHoveredId(obj.id)}
                  onMouseLeave={() => setHoveredId((prev) => prev === obj.id ? null : prev)}
                >
                  <LayoutObjectRenderer
                    obj={obj}
                    isSelected={isSelected}
                    assignedCount={tableGuests.length}
                    capacity={obj.capacity}
                  />

                  {/* Dimension badge: centered on object when selected or resizing */}
                  {isSelected && metersPerPixel && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[15]">
                      <div className={cn(
                        "font-mono font-semibold whitespace-nowrap rounded-md shadow-lg border",
                        resizing?.id === obj.id
                          ? "text-sm px-3 py-1.5 bg-gray-900/85 text-white border-white/20"
                          : "text-xs px-2 py-1 bg-gray-900/70 text-white/90 border-white/15"
                      )}>
                        {formatDim(obj.width)} &times; {formatDim(obj.height)}
                      </div>
                    </div>
                  )}

                  {/* Resize handles */}
                  {isSelected && !obj.locked && resizeHandles.map((handle) => (
                    <div
                      key={handle}
                      className={cn(
                        'absolute w-3 h-3 bg-primary border-2 border-primary-foreground rounded-full z-10 shadow-md shadow-primary/30',
                        handlePositions[handle],
                        handleCursors[handle],
                      )}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setResizing({
                          id: obj.id, handle,
                          startX: e.clientX, startY: e.clientY,
                          startW: obj.width, startH: obj.height,
                          startObjX: obj.x, startObjY: obj.y,
                        });
                      }}
                    />
                  ))}
                </div>
              );

              // Wrap tables with a popover for guest details on double-click
              if (isTable) {
                return (
                  <Popover key={obj.id} open={tablePopoverId === obj.id} onOpenChange={(open) => setTablePopoverId(open ? obj.id : null)}>
                    <PopoverTrigger asChild>
                      {objectEl}
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-80 p-3 z-[100]"
                      side="right"
                      align="start"
                      sideOffset={12}
                      onPointerDownOutside={() => setTablePopoverId(null)}
                    >
                      <TableDetailPopover
                        table={obj}
                        guests={tableGuests}
                        capacity={obj.capacity}
                      />
                    </PopoverContent>
                  </Popover>
                );
              }

              return objectEl;
            })}

            {/* Drawing preview rectangle */}
            {drawing && drawingTool && (() => {
              const x = Math.min(drawing.startX, drawing.currentX);
              const y = Math.min(drawing.startY, drawing.currentY);
              const w = Math.abs(drawing.currentX - drawing.startX);
              const h = Math.abs(drawing.currentY - drawing.startY);
              return (
                <div
                  className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none z-[60] flex items-center justify-center"
                  style={{ left: x, top: y, width: w, height: h }}
                >
                  <div className="text-xs font-mono text-primary bg-card/90 px-2 py-0.5 rounded whitespace-nowrap">
                    {metersPerPixel
                      ? `${formatDimension(w, metersPerPixel, unitSystem)} × ${formatDimension(h, metersPerPixel, unitSystem)}`
                      : `${Math.round(w)} × ${Math.round(h)}px`
                    }
                  </div>
                  {/* Width label on top edge */}
                  {w > 40 && metersPerPixel && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-primary bg-card/90 px-1.5 py-0.5 rounded border border-primary/30 whitespace-nowrap">
                      {formatDimension(w, metersPerPixel, unitSystem)}
                    </div>
                  )}
                  {/* Height label on right edge */}
                  {h > 40 && metersPerPixel && (
                    <div className="absolute -right-16 top-1/2 -translate-y-1/2 text-[10px] font-mono text-primary bg-card/90 px-1.5 py-0.5 rounded border border-primary/30 whitespace-nowrap">
                      {formatDimension(h, metersPerPixel, unitSystem)}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Smart snap alignment guides */}
            {activeSnapGuides.length > 0 && (
              <SnapGuideOverlay
                guides={activeSnapGuides}
                canvasWidth={canvasSize.width}
                canvasHeight={canvasSize.height}
              />
            )}
          </div>

          {/* Selection toolbar — floats above canvas when 2+ objects selected */}
          {selection.selectionCount >= 2 && (
            <SelectionToolbar
              selectedObjects={objects.filter((o) => selection.isSelected(o.id))}
              onAlign={(edge) => {
                pushUndoSnapshot();
                const sel = objects.filter((o) => selection.isSelected(o.id));
                const results = alignObjects(sel, edge === 'center' ? 'centerH' : edge === 'middle' ? 'centerV' : edge);
                results.forEach((r) => updateLayoutObject(r.id, { x: r.x, y: r.y }));
              }}
              onDistribute={(axis) => {
                pushUndoSnapshot();
                const sel = objects.filter((o) => selection.isSelected(o.id));
                const results = distributeEqual(sel, axis);
                results.forEach((r) => updateLayoutObject(r.id, { x: r.x, y: r.y }));
              }}
              onDelete={() => {
                pushUndoSnapshot();
                [...selection.selectedIds].forEach((id) => removeLayoutObject(id));
                selection.clearSelection();
              }}
            />
          )}

          {/* Marquee selection */}
          <SelectionMarquee
            canvasRef={canvasRef}
            zoom={zoom}
            active={!drawingTool && !dragging}
            onSelect={(rect) => selection.selectArea(rect, objects)}
          />
        </div>
      </div>

      {/* Inspector */}
      {showInspector && <div className="w-72 flex-shrink-0 border-l border-border bg-card/50 overflow-y-auto">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Inspector</h3>
          </div>
        </div>

        {selected ? (
          <div className="space-y-0">
            {/* Color-coded object header with type icon */}
            {(() => {
              const TypeIcon = typeIcons[selected.type] || Square;
              return (
                <div className={cn('px-4 py-3 border-b flex items-center gap-2.5', typeHeaderColors[selected.type] || 'bg-muted/30 border-border text-muted-foreground')}>
                  <TypeIcon className="w-5 h-5 flex-shrink-0" />
                  <input
                    className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-foreground placeholder:text-muted-foreground border-none outline-none focus:ring-0 p-0 truncate"
                    value={selected.name}
                    onChange={(e) => updateLayoutObject(selected.id, { name: e.target.value })}
                    placeholder="Object name"
                  />
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">{typeLabels[selected.type]}</Badge>
                </div>
              );
            })()}

            <div className="p-4 space-y-5">
            {/* Real-world dimensions summary */}
            {metersPerPixel && (
              <div className="rounded-lg border border-blue-400/30 bg-blue-50/5 px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-blue-400/80"><Ruler className="w-3 h-3" /> Real-World Size</div>
                <div className="flex items-center gap-3 text-sm font-mono font-semibold text-foreground">
                  <span>{formatDimension(selected.width, metersPerPixel, unitSystem)}</span>
                  <X className="w-3 h-3 text-muted-foreground" />
                  <span>{formatDimension(selected.height, metersPerPixel, unitSystem)}</span>
                </div>
                {measureGuides && (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground font-mono mt-1">
                    <span>Left: {formatDimension(measureGuides.edges.left, metersPerPixel, unitSystem)}</span>
                    <span>Right: {formatDimension(measureGuides.edges.right, metersPerPixel, unitSystem)}</span>
                    <span>Top: {formatDimension(measureGuides.edges.top, metersPerPixel, unitSystem)}</span>
                    <span>Bottom: {formatDimension(measureGuides.edges.bottom, metersPerPixel, unitSystem)}</span>
                  </div>
                )}
              </div>
            )}

              {/* Section: Transform */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Move className="w-3 h-3" /> Transform</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">X</label>
                    <input className="w-full mt-1 px-2.5 py-2 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" type="number" value={selected.x} onChange={(e) => updateLayoutObject(selected.id, { x: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Y</label>
                    <input className="w-full mt-1 px-2.5 py-2 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" type="number" value={selected.y} onChange={(e) => updateLayoutObject(selected.id, { y: Number(e.target.value) })} />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1"><RotateCw className="w-3 h-3" /> Rotation</label>
                  <input className="w-full mt-1 px-2.5 py-2 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" type="number" value={selected.rotation} onChange={(e) => updateLayoutObject(selected.id, { rotation: Number(e.target.value) })} />
                </div>
              </div>

              {/* Section: Size */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Maximize2 className="w-3 h-3" /> Size</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Width {metersPerPixel ? `(${formatDimension(selected.width, metersPerPixel, unitSystem)})` : ''}</label>
                    <input className="w-full mt-1 px-2.5 py-2 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" type="number" value={selected.width} onChange={(e) => updateLayoutObject(selected.id, { width: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Height {metersPerPixel ? `(${formatDimension(selected.height, metersPerPixel, unitSystem)})` : ''}</label>
                    <input className="w-full mt-1 px-2.5 py-2 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" type="number" value={selected.height} onChange={(e) => updateLayoutObject(selected.id, { height: Number(e.target.value) })} />
                  </div>
                </div>
              </div>

              {/* Section: Properties */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Tag className="w-3 h-3" /> Properties</h4>
                {['round_table', 'rect_table'].includes(selected.type) && (
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" /> Capacity</label>
                    <input className="w-full mt-1 px-2.5 py-2 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/50" type="number" value={selected.capacity} onChange={(e) => updateLayoutObject(selected.id, { capacity: Number(e.target.value) })} />
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1"><StickyNote className="w-3 h-3" /> Notes</label>
                  <textarea className="w-full mt-1 px-2.5 py-2 text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" rows={2} value={selected.notes} onChange={(e) => updateLayoutObject(selected.id, { notes: e.target.value })} />
                </div>
              </div>
            {selected.type === 'round_table' || selected.type === 'rect_table' ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Table assignments</p>
                  <p className="text-xs font-mono text-muted-foreground">{getTableGuests(selected.id, versionId).length}/{selected.capacity}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: Math.max(selected.capacity, 1) }).map((_, index) => {
                    const assignment = selectedAssignments.find((item) => (item.seatNumber ?? 0) === index + 1);
                    const guest = assignment ? getTableGuests(selected.id, versionId).find((g) => g.id === assignment.guestId) : undefined;
                    return (
                      <div key={index} className={cn('rounded-md border px-2 py-2', guest ? 'border-primary/30 bg-card/80' : 'border-dashed border-border/70 bg-background/40')}>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Seat {index + 1}</p>
                        <p className="text-sm text-foreground mt-1">{guest?.displayName ?? 'Open seat'}</p>
                        <p className="text-xs text-muted-foreground">{guest?.organization || guest?.seatingPreference || 'Available for assignment'}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="rounded-md border border-border/70 bg-background/40 px-2 py-2 text-xs text-muted-foreground">
                  {metersPerPixel && nearestNeighborDistance
                    ? `Nearest object spacing: ${formatDimension(nearestNeighborDistance, metersPerPixel, unitSystem)}`
                    : 'Set map scale to understand spacing between tables and structures precisely.'}
                </div>
              </div>
            ) : null}
              {/* Section: Layer Order */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Layers className="w-3 h-3" /> Layer Order</h4>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => handleBringToFront(selected.id)}>
                    <ArrowUpToLine className="w-3.5 h-3.5 mr-1" /> Bring to Front
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs h-8" onClick={() => handleSendToBack(selected.id)}>
                    <ArrowDownToLine className="w-3.5 h-3.5 mr-1" /> Send to Back
                  </Button>
                </div>
              </div>

              {/* Section: Actions */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</h4>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="h-8" onClick={() => updateLayoutObject(selected.id, { locked: !selected.locked })}>
                    {selected.locked ? <Lock className="w-3.5 h-3.5 mr-1" /> : <Unlock className="w-3.5 h-3.5 mr-1" />}
                    {selected.locked ? 'Locked' : 'Lock'}
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => updateLayoutObject(selected.id, { visible: !selected.visible })}>
                    {selected.visible ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
                    {selected.visible ? 'Visible' : 'Hidden'}
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => { if (window.confirm('Delete this layout object?')) { removeLayoutObject(selected.id); setSelectedId(null); } }}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Press <kbd className="px-1 py-0.5 bg-muted rounded border border-border text-[9px] font-mono">Del</kbd> to delete selected object</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Select an object to inspect its properties</p>
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objects ({objects.length})</h4>
              {objects.length === 0 && (
                <p className="text-xs text-muted-foreground/60 py-4 text-center">No objects yet. Use the toolbar to add tables, stages, and more.</p>
              )}
              {objects.map((obj) => (
                <div
                  key={obj.id}
                  className="flex items-center gap-1 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <button
                    onClick={() => setSelectedId(obj.id)}
                    className="flex-1 text-left px-3 py-2 text-sm flex items-center justify-between min-w-0"
                  >
                    <span className="text-foreground truncate">{obj.name}</span>
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground ml-2 flex-shrink-0">{typeLabels[obj.type]}</Badge>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); if (window.confirm('Delete this layout object?')) { removeLayoutObject(obj.id); if (selectedId === obj.id) setSelectedId(null); } }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>}
      {/* Satellite Capture Modal */}
      {showSatelliteCapture && (
        <Suspense fallback={null}>
          <VenueCapture
            onCapture={(imageDataUrl, mppCss, imgW, imgH, cssRegionWidth) => {
              setVenueImage(imageDataUrl);
              if (imgW && imgH && mppCss && cssRegionWidth) {
                // Real-world width = CSS region width × meters-per-CSS-pixel
                const realWidthMeters = cssRegionWidth * mppCss;
                // Canvas displays the captured image; use up to 1600px wide
                const maxCanvasW = 1600;
                const canvasW = Math.min(imgW, maxCanvasW);
                const canvasH = Math.round(imgH * (canvasW / imgW));
                setCanvasSize({ width: canvasW, height: canvasH });
                // Each canvas pixel represents this many real-world meters
                setMetersPerPixel(realWidthMeters / canvasW);
              } else {
                setMetersPerPixel(mppCss);
              }
              setShowSatelliteCapture(false);
            }}
            onClose={() => setShowSatelliteCapture(false)}
          />
        </Suspense>
      )}
    </div>
  );
}


