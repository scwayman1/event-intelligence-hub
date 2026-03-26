import { useParams } from 'react-router-dom';
import { useEventStore } from '@/data/store';
import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import { 
  ZoomIn, ZoomOut, Lock, Unlock, Eye, EyeOff, 
  Plus, Trash2, RotateCw, Grid3X3, Layers, ImageIcon, X, Satellite
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LayoutObject, LayoutObjectType } from '@/types/events';

const VenueCapture = lazy(() => import('@/components/layout/VenueCapture'));

const objectColors: Record<string, string> = {
  tent: 'border-info/40 bg-info/5',
  stage: 'border-warning/50 bg-warning/10',
  podium: 'border-warning/40 bg-warning/15',
  round_table: 'border-primary/50 bg-primary/10',
  rect_table: 'border-primary/50 bg-primary/10',
  checkin: 'border-success/40 bg-success/10',
  bar: 'border-accent/40 bg-accent/10',
  vip_area: 'border-warning/30 bg-warning/5',
  chair: 'border-muted-foreground/30 bg-muted/20',
  photo_area: 'border-info/30 bg-info/5',
  registration: 'border-success/30 bg-success/5',
  aisle: 'border-border bg-muted/10',
  dance_floor: 'border-primary/20 bg-primary/5',
  catering: 'border-accent/30 bg-accent/5',
  signage: 'border-muted-foreground/30 bg-muted/10',
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
  { type: 'round_table', label: 'Round Table' },
  { type: 'rect_table', label: 'Rect Table' },
  { type: 'stage', label: 'Stage' },
  { type: 'podium', label: 'Podium' },
  { type: 'checkin', label: 'Check-In' },
  { type: 'bar', label: 'Bar' },
  { type: 'vip_area', label: 'VIP Area' },
  { type: 'tent', label: 'Tent' },
  { type: 'catering', label: 'Catering' },
  { type: 'dance_floor', label: 'Dance Floor' },
];

export default function EventLayout() {
  const { eventId } = useParams();
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
  const [venueImage, setVenueImage] = useState<string | null>(null);
  const [imageOpacity, setImageOpacity] = useState(0.35);
  const [showSatelliteCapture, setShowSatelliteCapture] = useState(false);
  const [metersPerPixel, setMetersPerPixel] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVenueImage(url);
    e.target.value = '';
  };

  const selected = objects.find((o) => o.id === selectedId);

  const handleMouseDown = useCallback((e: React.MouseEvent, obj: LayoutObject) => {
    if (obj.locked) return;
    e.stopPropagation();
    setSelectedId(obj.id);
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragging({ id: obj.id, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - canvasRect.left - dragging.offsetX) / zoom;
    const y = (e.clientY - canvasRect.top - dragging.offsetY) / zoom;
    updateLayoutObject(dragging.id, {
      x: showGrid ? Math.round(x / 20) * 20 : Math.round(x),
      y: showGrid ? Math.round(y / 20) * 20 : Math.round(y),
    });
  }, [dragging, zoom, showGrid, updateLayoutObject]);

  const handleMouseUp = useCallback(() => setDragging(null), []);

  const handleAddObject = (type: LayoutObjectType) => {
    const id = `lo-${Date.now()}`;
    addLayoutObject({
      id, versionId, type, name: typeLabels[type],
      x: 200, y: 200, width: type === 'tent' ? 200 : type.includes('table') ? 80 : 60,
      height: type === 'tent' ? 150 : type.includes('table') ? (type === 'rect_table' ? 40 : 80) : 40,
      rotation: 0, capacity: type.includes('table') ? 8 : 0, notes: '', category: '',
      locked: false, visible: true, zIndex: objects.length,
    });
  };

  if (!event) return <div className="p-8 text-muted-foreground">Event not found</div>;

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
          <Button variant={showGrid ? 'secondary' : 'ghost'} size="icon" onClick={() => setShowGrid(!showGrid)}><Grid3X3 className="w-4 h-4" /></Button>
          <div className="w-px h-6 bg-border mx-1" />
          {/* Venue image upload */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button variant={venueImage ? 'secondary' : 'ghost'} size="sm" className="text-xs h-7 px-2 gap-1" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="w-3.5 h-3.5" />{venueImage ? 'Replace Map' : 'Upload Map'}
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
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { if (venueImage) URL.revokeObjectURL(venueImage); setVenueImage(null); }}>
                <X className="w-3 h-3 text-muted-foreground" />
              </Button>
            </>
          )}
          <div className="w-px h-6 bg-border mx-1" />
          <div className="flex gap-1">
            {objectPalette.map((item) => (
              <Button key={item.type} variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => handleAddObject(item.type)}>
                <Plus className="w-3 h-3 mr-1" />{item.label}
              </Button>
            ))}
          </div>
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
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: 800, height: 600, position: 'relative' }}
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

              return (
                <div
                  key={obj.id}
                  className={cn(
                    'absolute border-2 flex flex-col items-center justify-center cursor-move transition-shadow select-none',
                    objectColors[obj.type] || 'border-border bg-muted/10',
                    obj.type === 'round_table' && 'rounded-full',
                    isSelected && 'ring-2 ring-primary shadow-lg shadow-primary/20',
                    obj.locked && 'cursor-not-allowed opacity-70',
                  )}
                  style={{
                    left: obj.x, top: obj.y, width: obj.width, height: obj.height,
                    transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                  }}
                  onMouseDown={(e) => handleMouseDown(e, obj)}
                >
                  <span className="text-[10px] font-medium text-foreground leading-tight text-center px-1 truncate max-w-full">
                    {obj.name}
                  </span>
                  {isTable && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {tableGuests.length}/{obj.capacity}
                    </span>
                  )}
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
    </div>
  );
}
