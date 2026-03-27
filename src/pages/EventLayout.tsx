import { useParams, useOutletContext } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import {
  ZoomIn, ZoomOut, Lock, Unlock, Eye, EyeOff,
  Plus, Trash2, Grid3X3, Layers, ImageIcon, X, Satellite, Sparkles, Users, Ruler, WandSparkles,
  Box, Calculator, Move, ArrowLeftRight, ArrowUpDown
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
import { metersToPixels, supportPresets, tablePresets, type ObjectPreset } from '@/lib/layout-presets';
import { calculateTableFit, edgeDistances, nearestEdgeDistances, type RoomBounds } from '@/lib/space-calculator';
import type { LayoutObject, LayoutObjectType } from '@/types/events';
import { LayoutObjectRenderer } from '@/components/layout/LayoutObjectRenderer';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { TableDetailPopover } from '@/components/layout/TableDetailPopover';

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
  const { showInspector } = useOutletContext<LayoutOutletContext>();
  const events = useEventStore((s) => s.events);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const updateLayoutObject = useEventStore((s) => s.updateLayoutObject);
  const addLayoutObject = useEventStore((s) => s.addLayoutObject);
  const removeLayoutObject = useEventStore((s) => s.removeLayoutObject);
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
  // Default: 1px ≈ 0.03m (~0.1ft), so 800px canvas ≈ 80ft wide
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(0.03048);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');
  const [snapMode, setSnapMode] = useState<'grid' | 'measured' | 'free'>('measured');
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 800, height: 600 });
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
  const [tablePopoverId, setTablePopoverId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setSelectedId(obj.id);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragging({ id: obj.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  }, []);

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
    updateLayoutObject(dragging.id, {
      x: snapValue(x),
      y: snapValue(y),
    });
  }, [dragging, resizing, zoom, snapValue, updateLayoutObject]);

  const handleMouseUp = useCallback(() => { setDragging(null); setResizing(null); }, []);

  // Delete/Backspace keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        const obj = layoutObjects.find((o) => o.id === selectedId);
        if (obj?.locked) return;
        removeLayoutObject(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, layoutObjects, removeLayoutObject]);

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
            <div className="ml-auto"><SaveIndicator /></div>
          </div>

          {/* Row 2: Add objects */}
          <div className="flex items-center gap-1 px-3 py-1 border-t border-border/50 flex-wrap"
            style={{ background: 'linear-gradient(90deg, hsla(152,68%,42%,0.06) 0%, hsla(84,60%,48%,0.04) 100%)' }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Tables</span>
            {tablePresets.map((preset) => (
              <Button key={preset.label} variant="ghost" size="sm" className="text-[11px] h-6 px-1.5" onClick={() => handleAddObject(preset.type, preset)}>
                <Plus className="w-3 h-3 mr-0.5" />{preset.label}
              </Button>
            ))}
            <div className="w-px h-4 bg-border mx-1" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Fixtures</span>
            {supportPresets.map((preset) => (
              <Button key={preset.label} variant="ghost" size="sm" className="text-[11px] h-6 px-1.5" onClick={() => handleAddObject(preset.type, preset)}>
                <Plus className="w-3 h-3 mr-0.5" />{preset.label}
              </Button>
            ))}
            {objectPalette.map((item) => (
              <Button key={item.type} variant="ghost" size="sm" className="text-[11px] h-6 px-1.5" onClick={() => handleAddObject(item.type)}>
                <Plus className="w-3 h-3 mr-0.5" />{item.label}
              </Button>
            ))}
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
            {/* Grid overlay on top of image */}
            {venueImage && showGrid && (
              <div
                className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[size:20px_20px]"
                style={{ opacity: 0.4 }}
              />
            )}

            {/* Live measurement guides for selected/dragging object */}
            {selected && showMeasureGuides && measureGuides && metersPerPixel && (
              <>
                {/* Distance to left edge */}
                {measureGuides.edges.left > 10 && (
                  <div className="absolute pointer-events-none z-[50]" style={{ left: 0, top: selected.y + selected.height / 2, width: selected.x, height: 0 }}>
                    <div className="border-t border-dashed border-emerald-400/60 w-full" />
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                      {formatDimension(measureGuides.edges.left, metersPerPixel, unitSystem)}
                    </div>
                  </div>
                )}
                {/* Distance to right edge */}
                {measureGuides.edges.right > 10 && (
                  <div className="absolute pointer-events-none z-[50]" style={{ left: selected.x + selected.width, top: selected.y + selected.height / 2, width: measureGuides.edges.right, height: 0 }}>
                    <div className="border-t border-dashed border-emerald-400/60 w-full" />
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                      {formatDimension(measureGuides.edges.right, metersPerPixel, unitSystem)}
                    </div>
                  </div>
                )}
                {/* Distance to top edge */}
                {measureGuides.edges.top > 10 && (
                  <div className="absolute pointer-events-none z-[50]" style={{ left: selected.x + selected.width / 2, top: 0, width: 0, height: selected.y }}>
                    <div className="border-l border-dashed border-emerald-400/60 h-full" />
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                      {formatDimension(measureGuides.edges.top, metersPerPixel, unitSystem)}
                    </div>
                  </div>
                )}
                {/* Distance to bottom edge */}
                {measureGuides.edges.bottom > 10 && (
                  <div className="absolute pointer-events-none z-[50]" style={{ left: selected.x + selected.width / 2, top: selected.y + selected.height, width: 0, height: measureGuides.edges.bottom }}>
                    <div className="border-l border-dashed border-emerald-400/60 h-full" />
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-emerald-400 bg-card/90 px-1 rounded border border-emerald-400/30 whitespace-nowrap">
                      {formatDimension(measureGuides.edges.bottom, metersPerPixel, unitSystem)}
                    </div>
                  </div>
                )}
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

              const objectEl = (
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
                  onDoubleClick={(e) => {
                    if (isTable) {
                      e.stopPropagation();
                      setTablePopoverId(tablePopoverId === obj.id ? null : obj.id);
                    }
                  }}
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
          </div>
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
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={selected.name}
                onChange={(e) => updateLayoutObject(selected.id, { name: e.target.value })}
              />
            </div>
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
                <label className="text-xs text-muted-foreground">Width {metersPerPixel ? `(${formatDimension(selected.width, metersPerPixel, unitSystem)})` : ''}</label>
                <input className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary" type="number" value={selected.width} onChange={(e) => updateLayoutObject(selected.id, { width: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Height {metersPerPixel ? `(${formatDimension(selected.height, metersPerPixel, unitSystem)})` : ''}</label>
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
                    onClick={(e) => { e.stopPropagation(); removeLayoutObject(obj.id); if (selectedId === obj.id) setSelectedId(null); }}
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


