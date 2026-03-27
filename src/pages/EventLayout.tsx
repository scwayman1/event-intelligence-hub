import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useState, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import {
  ZoomIn, ZoomOut, Lock, Unlock, Eye, EyeOff,
  Plus, Trash2, Grid3X3, Layers, ImageIcon, X, Satellite, Sparkles, Users, Ruler, WandSparkles,
  Undo2, Redo2, HelpCircle, Copy,
} from 'lucide-react';
import { useUndo } from '@/hooks/use-undo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SaveIndicator } from '@/components/SaveIndicator';
import { cn } from '@/lib/utils';
import { type UnitSystem, formatScale, formatDimension } from '@/lib/units';
import { buildEventAnalytics } from '@/lib/event-analytics';
import { EventNotFound } from '@/components/EventNotFound';
import { metersToPixels, supportPresets, tablePresets, type ObjectPreset } from '@/lib/layout-presets';
import type { LayoutObject, LayoutObjectType } from '@/types/events';
import { LayoutObjectRenderer } from '@/components/layout/LayoutObjectRenderer';

const VenueCapture = lazy(() => import('@/components/layout/VenueCapture'));

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

const objectPalette: { type: LayoutObjectType; label: string }[] = [
  { type: 'stage', label: 'Stage' },
  { type: 'vip_area', label: 'VIP Area' },
  { type: 'catering', label: 'Catering' },
  { type: 'signage', label: 'Signage' },
];

export default function EventLayout() {
  const { eventId } = useParams();
  const events = useEventStore((s) => s.events);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const updateLayoutObject = useEventStore((s) => s.updateLayoutObject);
  const addLayoutObject = useEventStore((s) => s.addLayoutObject);
  const removeLayoutObject = useEventStore((s) => s.removeLayoutObject);
  const setLayoutObjects = useEventStore((s) => s.setLayoutObjects);
  const getTableGuests = useEventStore((s) => s.getTableGuests);

  const event = events.find((e) => e.id === eventId);
  const versionId = event?.activeVersionId || '';
  const objects = layoutObjects.filter((o) => o.versionId === versionId);

  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; handle: string; startX: number; startY: number; startW: number; startH: number; startObjX: number; startObjY: number } | null>(null);
  const [venueImage, setVenueImage] = useState<string | null>(null);
  const [imageOpacity, setImageOpacity] = useState(0.35);
  const [showSatelliteCapture, setShowSatelliteCapture] = useState(false);
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const [snapMode, setSnapMode] = useState<'grid' | 'measured'>('grid');
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
  const [showShortcuts, setShowShortcuts] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { undo, redo, canUndo, canRedo, pushState } = useUndo(objects);
  const preDragSnapshotRef = useRef<typeof objects | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVenueImage(url);
    e.target.value = '';
  };

  const analytics = event ? buildEventAnalytics({
    event,
    guests: useEventStore.getState().guests,
    versions: useEventStore.getState().versions,
    layoutObjects: useEventStore.getState().layoutObjects,
    seatingAssignments: useEventStore.getState().seatingAssignments,
    seatingRules: useEventStore.getState().seatingRules,
  }) : null;

  const selected = objects.find((o) => o.id === selectedId);
  const selectedAssignments = selected ? useEventStore.getState().seatingAssignments.filter((a) => a.tableId === selected.id && a.versionId === versionId) : [];

  const snapIncrement = metersPerPixel && snapMode === 'measured'
    ? Math.max(4, Math.round(0.5 / metersPerPixel))
    : 20;

  const snapValue = (v: number) => showGrid ? Math.round(v / snapIncrement) * snapIncrement : Math.round(v);

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
    setSelectedId(obj.id);
    preDragSnapshotRef.current = objects.map((o) => ({ ...o }));
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragging({ id: obj.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  }, [objects]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (resizing && canvasRef.current) {
      const dx = (e.clientX - resizing.startX) / zoom;
      const dy = (e.clientY - resizing.startY) / zoom;
      const handle = resizing.handle;
      let newW = resizing.startW;
      let newH = resizing.startH;
      let newX = resizing.startObjX;
      let newY = resizing.startObjY;

      if (handle.includes('e')) newW = Math.max(30, resizing.startW + dx);
      if (handle.includes('w')) { newW = Math.max(30, resizing.startW - dx); newX = resizing.startObjX + (resizing.startW - newW); }
      if (handle.includes('s')) newH = Math.max(30, resizing.startH + dy);
      if (handle.includes('n')) { newH = Math.max(30, resizing.startH - dy); newY = resizing.startObjY + (resizing.startH - newH); }

      updateLayoutObject(resizing.id, { width: snapValue(newW), height: snapValue(newH), x: snapValue(newX), y: snapValue(newY) });
      return;
    }
    if (!dragging || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - canvasRect.left - dragging.offsetX) / zoom;
    const y = (e.clientY - canvasRect.top - dragging.offsetY) / zoom;
    updateLayoutObject(dragging.id, {
      x: snapValue(x),
      y: snapValue(y),
    });
  }, [dragging, resizing, zoom, snapValue, updateLayoutObject]);

  const handleMouseUp = useCallback(() => {
    if ((dragging || resizing) && preDragSnapshotRef.current) {
      pushState(preDragSnapshotRef.current);
      preDragSnapshotRef.current = null;
    }
    setDragging(null);
    setResizing(null);
  }, [dragging, resizing, pushState]);

  // Handle undo/redo by restoring layout state
  const handleUndo = useCallback(() => {
    const restored = undo();
    if (restored) setLayoutObjects(restored);
  }, [undo, setLayoutObjects]);

  const handleRedo = useCallback(() => {
    const restored = redo();
    if (restored) setLayoutObjects(restored);
  }, [redo, setLayoutObjects]);

  // Duplicate selected object with +20px offset
  const handleDuplicate = useCallback(() => {
    if (!selectedId) return;
    const obj = objects.find((o) => o.id === selectedId);
    if (!obj) return;
    pushState(objects.map((o) => ({ ...o })));
    const newId = `lo-${crypto.randomUUID()}`;
    const duplicate: LayoutObject = {
      ...obj,
      id: newId,
      name: `${obj.name} copy`,
      x: obj.x + 20,
      y: obj.y + 20,
      locked: false,
      zIndex: objects.length,
    };
    addLayoutObject(duplicate);
    setSelectedId(newId);
  }, [selectedId, objects, addLayoutObject, pushState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+Z — Undo
      if (ctrl && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y — Redo
      if ((ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) || (ctrl && e.key === 'y')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Ctrl+D — Duplicate selected
      if (ctrl && e.key === 'd') {
        e.preventDefault();
        handleDuplicate();
        return;
      }

      // Ctrl+A — Select all objects (selects first object if none selected)
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        if (objects.length > 0 && !selectedId) {
          setSelectedId(objects[0].id);
        }
        return;
      }

      // Ctrl+L — Toggle lock on selected object
      if (ctrl && e.key === 'l') {
        e.preventDefault();
        if (selectedId) {
          const obj = layoutObjects.find((o) => o.id === selectedId);
          if (obj) updateLayoutObject(selectedId, { locked: !obj.locked });
        }
        return;
      }

      // Escape — Deselect
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
        setShowShortcuts(false);
        return;
      }

      // Delete/Backspace — Remove selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedId) return;
        e.preventDefault();
        const obj = layoutObjects.find((o) => o.id === selectedId);
        if (obj?.locked) return;
        pushState(objects.map((o) => ({ ...o })));
        removeLayoutObject(selectedId);
        setSelectedId(null);
        return;
      }

      // Arrow keys — Nudge selected object by snap increment
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (!selectedId) return;
        const obj = layoutObjects.find((o) => o.id === selectedId);
        if (!obj || obj.locked) return;
        e.preventDefault();
        pushState(objects.map((o) => ({ ...o })));
        const delta = snapIncrement;
        switch (e.key) {
          case 'ArrowUp': updateLayoutObject(selectedId, { y: obj.y - delta }); break;
          case 'ArrowDown': updateLayoutObject(selectedId, { y: obj.y + delta }); break;
          case 'ArrowLeft': updateLayoutObject(selectedId, { x: obj.x - delta }); break;
          case 'ArrowRight': updateLayoutObject(selectedId, { x: obj.x + delta }); break;
        }
        return;
      }

      // [ and ] — Rotate selected object by 15 degrees
      if (e.key === '[' || e.key === ']') {
        if (!selectedId) return;
        const obj = layoutObjects.find((o) => o.id === selectedId);
        if (!obj || obj.locked) return;
        e.preventDefault();
        pushState(objects.map((o) => ({ ...o })));
        const delta = e.key === '[' ? -15 : 15;
        updateLayoutObject(selectedId, { rotation: (obj.rotation + delta) % 360 });
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, layoutObjects, objects, removeLayoutObject, updateLayoutObject, handleUndo, handleRedo, handleDuplicate, pushState, snapIncrement]);

  const handleAddObject = (type: LayoutObjectType, preset?: ObjectPreset) => {
    pushState(objects.map((o) => ({ ...o })));
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

    addLayoutObject({
      id,
      versionId,
      type,
      name: preset?.label ?? typeLabels[type],
      x: 120 + column * 140,
      y: 140 + row * 110,
      width: w,
      height: h,
      rotation: 0,
      capacity,
      notes: '',
      category: type.includes('table') ? 'seating' : 'layout',
      locked: false,
      visible: true,
      zIndex: objects.length,
    });
  };

  if (!event) return <EventNotFound />;

  return (
    <div className="flex h-screen">
      {/* Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="h-12 border-b border-border flex items-center gap-2 px-4 bg-card/50">
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.min(z + 0.1, 3))}><ZoomIn className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom((z) => Math.max(z - 0.1, 0.3))}><ZoomOut className="w-4 h-4" /></Button>
          <span className="text-xs font-mono text-muted-foreground px-2">{Math.round(zoom * 100)}%</span>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" disabled={!canUndo} onClick={handleUndo} title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" disabled={!canRedo} onClick={handleRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 className="w-4 h-4" /></Button>
          {selectedId && (
            <Button variant="ghost" size="icon" onClick={handleDuplicate} title="Duplicate (Ctrl+D)"><Copy className="w-4 h-4" /></Button>
          )}
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant={showGrid ? 'secondary' : 'ghost'} size="icon" onClick={() => setShowGrid(!showGrid)}><Grid3X3 className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          {/* Venue image upload */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button variant={venueImage ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7 px-2 gap-1" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="w-3.5 h-3.5" />{venueImage ? 'Replace Map' : 'Upload Map'}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2 gap-1" onClick={() => setShowSatelliteCapture(true)}>
            <Satellite className="w-3.5 h-3.5" />Satellite
          </Button>
          {venueImage && (
            <>
              <div className="flex items-center gap-1.5 ml-1">
                <span className="text-[10px] text-muted-foreground">Opacity</span>
                <input
                  type="range" min="0.05" max="1" step="0.05"
                  value={imageOpacity}
                  onChange={(e) => setImageOpacity(Number(e.target.value))}
                  className="w-16 h-1 accent-primary"
                />
                <span className="text-[10px] font-mono text-muted-foreground w-6">{Math.round(imageOpacity * 100)}%</span>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (venueImage && venueImage.startsWith('blob:')) URL.revokeObjectURL(venueImage); setVenueImage(null); setMetersPerPixel(null); }}>
                <X className="w-3 h-3 text-muted-foreground" />
              </Button>
              {metersPerPixel && (
                <span className="text-[10px] font-mono text-muted-foreground ml-1">{formatScale(metersPerPixel, unitSystem)}</span>
              )}
              <button
                onClick={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')}
                className="ml-1 px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground text-[10px] font-medium uppercase tracking-wide"
              >
                {unitSystem === 'imperial' ? 'ft' : 'm'}
              </button>
            </>
          )}
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant={snapMode === 'measured' ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7 px-2 gap-1" onClick={() => setSnapMode((mode) => mode === 'grid' ? 'measured' : 'grid')}>
            <Ruler className="w-3.5 h-3.5" />{snapMode === 'grid' ? 'Grid Snap' : 'Measured Snap'}
          </Button>
          <div className="text-[10px] text-muted-foreground font-mono">{metersPerPixel ? `snap ${formatDimension(snapIncrement, metersPerPixel, unitSystem)}` : 'set map scale for precise snap'}</div>
          <div className="w-px h-6 bg-border mx-1" />
          <div className="flex gap-1">
            {tablePresets.map((preset) => (
              <Button key={preset.label} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleAddObject(preset.type, preset)}>
                <Plus className="w-3 h-3 mr-1" />{preset.label}
              </Button>
            ))}
          </div>
          <div className="w-px h-6 bg-border mx-1" />
          <div className="flex gap-1">
            {supportPresets.map((preset) => (
              <Button key={preset.label} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleAddObject(preset.type, preset)}>
                <Plus className="w-3 h-3 mr-1" />{preset.label}
              </Button>
            ))}
            {objectPalette.map((item) => (
              <Button key={item.type} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleAddObject(item.type)}>
                <Plus className="w-3 h-3 mr-1" />{item.label}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowShortcuts(!showShortcuts)} title="Keyboard shortcuts">
                <HelpCircle className="w-4 h-4" />
              </Button>
              {showShortcuts && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-card shadow-lg p-3 text-xs">
                  <div className="font-semibold text-foreground mb-2">Keyboard Shortcuts</div>
                  <div className="space-y-1 text-muted-foreground">
                    <div className="flex justify-between"><span>Undo</span><kbd className="font-mono bg-muted px-1 rounded">Ctrl+Z</kbd></div>
                    <div className="flex justify-between"><span>Redo</span><kbd className="font-mono bg-muted px-1 rounded">Ctrl+Shift+Z</kbd></div>
                    <div className="flex justify-between"><span>Duplicate</span><kbd className="font-mono bg-muted px-1 rounded">Ctrl+D</kbd></div>
                    <div className="flex justify-between"><span>Select all</span><kbd className="font-mono bg-muted px-1 rounded">Ctrl+A</kbd></div>
                    <div className="flex justify-between"><span>Deselect</span><kbd className="font-mono bg-muted px-1 rounded">Esc</kbd></div>
                    <div className="flex justify-between"><span>Delete</span><kbd className="font-mono bg-muted px-1 rounded">Del / Backspace</kbd></div>
                    <div className="flex justify-between"><span>Nudge</span><kbd className="font-mono bg-muted px-1 rounded">Arrow keys</kbd></div>
                    <div className="flex justify-between"><span>Rotate -15 / +15</span><kbd className="font-mono bg-muted px-1 rounded">[ / ]</kbd></div>
                    <div className="flex justify-between"><span>Toggle lock</span><kbd className="font-mono bg-muted px-1 rounded">Ctrl+L</kbd></div>
                  </div>
                </div>
              )}
            </div>
            <SaveIndicator />
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

        <div className="border-b border-border bg-card/20 px-4 py-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><WandSparkles className="w-3.5 h-3.5" /> New objects now drop into organized rows using standard preset sizes instead of piling up at one point.</div>
          <div className="font-mono">{selected && nearestNeighborDistance && metersPerPixel ? `nearest object ${formatDimension(nearestNeighborDistance, metersPerPixel, unitSystem)}` : 'select an object to inspect spacing'}</div>
        </div>

        {/* Canvas area */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-auto relative bg-background"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => setSelectedId(null)}
        >
          <div
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: canvasSize.width, height: canvasSize.height, position: 'relative' }}
            className={cn('transition-transform', showGrid && !venueImage && 'bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[size:20px_20px]')}
          >
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
            {/* Grid overlay on top of image */}
            {venueImage && showGrid && (
              <div
                className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[size:20px_20px]"
                style={{ opacity: 0.4 }}
              />
            )}
            {objects.filter((o) => o.visible).sort((a, b) => a.zIndex - b.zIndex).map((obj) => {
              const isTable = ['round_table', 'rect_table'].includes(obj.type);
              const tableGuests = isTable ? getTableGuests(obj.id, versionId) : [];
              const isSelected = selectedId === obj.id;

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

              return (
                <div
                  key={obj.id}
                  className={cn(
                    'absolute border-2 flex flex-col items-center justify-center cursor-move transition-shadow select-none overflow-visible',
                    objectColors[obj.type] || 'border-border bg-muted/10',
                    obj.type === 'round_table' && 'rounded-full',
                    obj.type === 'tent' && 'border-dashed',
                    isSelected && 'ring-2 ring-primary shadow-lg shadow-primary/20',
                    obj.locked && 'cursor-not-allowed opacity-70',
                  )}
                  style={{
                    left: obj.x, top: obj.y, width: obj.width, height: obj.height,
                    transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                    boxShadow: isSelected ? undefined : '0 1px 4px rgba(0,0,0,0.08), 0 0.5px 1px rgba(0,0,0,0.05)',
                  }}
                  onMouseDown={(e) => handleMouseDown(e, obj)}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(obj.id); }}
                >
                  <LayoutObjectRenderer
                    obj={obj}
                    isSelected={isSelected}
                    assignedCount={tableGuests.length}
                    capacity={obj.capacity}
                  />

                  {/* Dimension labels for selected objects */}
                  {isSelected && (
                    <>
                      {/* Width label - bottom */}
                      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-primary bg-card/90 px-1 rounded border border-primary/30 whitespace-nowrap">
                        {formatDim(obj.width)}
                      </div>
                      {/* Height label - right */}
                      <div className="absolute top-1/2 -right-1 translate-x-full -translate-y-1/2 text-[9px] font-mono text-primary bg-card/90 px-1 rounded border border-primary/30 whitespace-nowrap">
                        {formatDim(obj.height)}
                      </div>
                    </>
                  )}

                  {/* Resize handles */}
                  {isSelected && !obj.locked && resizeHandles.map((handle) => (
                    <div
                      key={handle}
                      className={cn(
                        'absolute w-2.5 h-2.5 bg-primary border border-primary-foreground rounded-sm z-10',
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
            })}
          </div>
        </div>
      </div>

      {/* Inspector */}
      <div className="w-72 border-l border-border bg-card/50 overflow-y-auto">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Inspector</h3>
          </div>
        </div>

        {selected ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={selected.name}
                onChange={(e) => updateLayoutObject(selected.id, { name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">X</label>
                <input className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={selected.x} onChange={(e) => updateLayoutObject(selected.id, { x: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Y</label>
                <input className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={selected.y} onChange={(e) => updateLayoutObject(selected.id, { y: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Width</label>
                <input className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={selected.width} onChange={(e) => updateLayoutObject(selected.id, { width: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Height</label>
                <input className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={selected.height} onChange={(e) => updateLayoutObject(selected.id, { height: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Rotation</label>
              <input className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={selected.rotation} onChange={(e) => updateLayoutObject(selected.id, { rotation: Number(e.target.value) })} />
            </div>
            {['round_table', 'rect_table'].includes(selected.type) && (
              <div>
                <label className="text-xs text-muted-foreground">Capacity</label>
                <input className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={selected.capacity} onChange={(e) => updateLayoutObject(selected.id, { capacity: Number(e.target.value) })} />
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <textarea className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" rows={2} value={selected.notes} onChange={(e) => updateLayoutObject(selected.id, { notes: e.target.value })} />
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
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => updateLayoutObject(selected.id, { locked: !selected.locked })}>
                {selected.locked ? <Lock className="w-3.5 h-3.5 mr-1" /> : <Unlock className="w-3.5 h-3.5 mr-1" />}
                {selected.locked ? 'Locked' : 'Lock'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => updateLayoutObject(selected.id, { visible: !selected.visible })}>
                {selected.visible ? <Eye className="w-3.5 h-3.5 mr-1" /> : <EyeOff className="w-3.5 h-3.5 mr-1" />}
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { removeLayoutObject(selected.id); setSelectedId(null); }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Select an object to inspect its properties</p>
            <div className="mt-4 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objects ({objects.length})</h4>
              {objects.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setSelectedId(obj.id)}
                  className="w-full text-left px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors flex items-center justify-between"
                >
                  <span className="text-foreground truncate">{obj.name}</span>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground ml-2">{typeLabels[obj.type]}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Satellite Capture Modal */}
      {showSatelliteCapture && (
        <Suspense fallback={null}>
          <VenueCapture
            onCapture={(imageDataUrl, mpp, imgW, imgH) => {
              setVenueImage(imageDataUrl);
              setMetersPerPixel(mpp);
              // Resize canvas to match captured image aspect ratio
              if (imgW && imgH) {
                const maxW = 1200;
                const scale = Math.min(maxW / imgW, 1);
                setCanvasSize({ width: Math.round(imgW * scale), height: Math.round(imgH * scale) });
                // Adjust metersPerPixel for the scaled canvas
                if (mpp) setMetersPerPixel(mpp / scale);
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


