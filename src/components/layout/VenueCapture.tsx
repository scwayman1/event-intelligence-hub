import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Satellite, MapPin, Download, X, Loader2, Ruler, Move, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAPBOX_ACCESS_TOKEN } from '@/config/mapbox';
import { type UnitSystem, formatDistance, formatScale } from '@/lib/units';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface VenueCaptureProps {
  onCapture: (imageDataUrl: string, metersPerPixel: number | null, imageWidth: number, imageHeight: number, cssRegionWidth: number) => void;
  onClose: () => void;
}

function metersPerPxAtZoom(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function VenueCapture({ onCapture, onClose }: VenueCaptureProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<mapboxgl.Map | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ place_name: string; center: [number, number] }>>([]);
  const [capturing, setCapturing] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(20);
  const [currentLat, setCurrentLat] = useState(0);
  const [placeName, setPlaceName] = useState('');
  const [unitSystem, setUnitSystem] = useState<UnitSystem>('imperial');

  // Capture region state
  const [region, setRegion] = useState<CaptureRegion>({ x: 100, y: 60, width: 600, height: 400 });
  const [regionDrag, setRegionDrag] = useState<{ type: 'move' | string; startMouseX: number; startMouseY: number; startRegion: CaptureRegion } | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    if (!MAPBOX_ACCESS_TOKEN) {
      setError('Mapbox access token is missing. Set VITE_MAPBOX_ACCESS_TOKEN in your .env file.');
      return;
    }

    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

    try {
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [-77.0365, 38.8977],
        zoom: 20,
        maxZoom: 22,
        minZoom: 14,
        attributionControl: false,
        preserveDrawingBuffer: true, // needed for canvas capture
        // Request high-resolution tiles for crisp zoom
        pixelRatio: Math.max(window.devicePixelRatio || 1, 2),
      });

      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

      map.on('load', () => {
        setLoaded(true);
        setCurrentLat(38.8977);
      });

      map.on('zoom', () => {
        setCurrentZoom(parseFloat(map.getZoom().toFixed(1)));
      });

      map.on('move', () => {
        const center = map.getCenter();
        setCurrentLat(center.lat);
      });

      map.on('error', (e) => {
        console.error('Mapbox error:', e.error);
      });

      mapInstance.current = map;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Mapbox');
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Center the region when map container is available
  useEffect(() => {
    if (!mapRef.current || !loaded) return;
    const rect = mapRef.current.getBoundingClientRect();
    const w = Math.min(600, rect.width - 80);
    const h = Math.min(400, rect.height - 40);
    setRegion({
      x: (rect.width - w) / 2,
      y: (rect.height - h) / 2,
      width: w,
      height: h,
    });
  }, [loaded]);

  // Geocoding search via Mapbox
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=5&types=poi,address,place`
        );
        const data = await res.json();
        setSearchResults(data.features || []);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }, []);

  const handleSelectPlace = useCallback((result: { place_name: string; center: [number, number] }) => {
    if (mapInstance.current) {
      mapInstance.current.flyTo({
        center: result.center,
        zoom: 19,
        duration: 1500,
      });
      setPlaceName(result.place_name.split(',')[0]);
      setCurrentLat(result.center[1]);
    }
    setSearchQuery(result.place_name);
    setSearchResults([]);
  }, []);

  // Region drag/resize handlers
  const handleRegionMouseDown = useCallback((e: React.MouseEvent, type: string) => {
    e.preventDefault();
    e.stopPropagation();
    setRegionDrag({
      type,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRegion: { ...region },
    });
  }, [region]);

  useEffect(() => {
    if (!regionDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - regionDrag.startMouseX;
      const dy = e.clientY - regionDrag.startMouseY;
      const sr = regionDrag.startRegion;
      const type = regionDrag.type;

      if (type === 'move') {
        setRegion({ ...sr, x: sr.x + dx, y: sr.y + dy });
        return;
      }

      let { x, y, width, height } = sr;
      const MIN = 100;

      if (type.includes('e')) width = Math.max(MIN, sr.width + dx);
      if (type.includes('w')) { width = Math.max(MIN, sr.width - dx); x = sr.x + (sr.width - width); }
      if (type.includes('s')) height = Math.max(MIN, sr.height + dy);
      if (type.includes('n')) { height = Math.max(MIN, sr.height - dy); y = sr.y + (sr.height - height); }

      setRegion({ x, y, width, height });
    };

    const handleMouseUp = () => setRegionDrag(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [regionDrag]);

  const handleCapture = useCallback(() => {
    if (!mapInstance.current || !mapRef.current) return;
    setCapturing(true);

    const map = mapInstance.current;

    try {
      const canvas = map.getCanvas();
      // The Mapbox canvas renders at its own pixel ratio (set via pixelRatio option)
      const canvasPixelRatio = canvas.width / canvas.clientWidth;

      const cvs = document.createElement('canvas');
      cvs.width = Math.round(region.width * canvasPixelRatio);
      cvs.height = Math.round(region.height * canvasPixelRatio);
      const ctx = cvs.getContext('2d');

      if (ctx) {
        ctx.drawImage(
          canvas,
          Math.round(region.x * canvasPixelRatio),
          Math.round(region.y * canvasPixelRatio),
          Math.round(region.width * canvasPixelRatio),
          Math.round(region.height * canvasPixelRatio),
          0, 0,
          cvs.width,
          cvs.height,
        );

        const dataUrl = cvs.toDataURL('image/jpeg', 0.95);

        // Use map.unproject() to compute exact ground distance from Mapbox's projection.
        // This is more reliable than the zoom-based formula which assumes 256px tiles.
        const topLeft = map.unproject([region.x, region.y]);
        const topRight = map.unproject([region.x + region.width, region.y]);

        // Haversine distance between the two corners
        const R = 6371000; // Earth radius in meters
        const dLon = ((topRight.lng - topLeft.lng) * Math.PI) / 180;
        const lat1 = (topLeft.lat * Math.PI) / 180;
        const lat2 = (topRight.lat * Math.PI) / 180;
        const a =
          Math.sin(0) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const realWidthMeters = R * c;

        // Meters per CSS pixel for the captured region
        const mppCss = realWidthMeters / region.width;

        onCapture(dataUrl, mppCss, cvs.width, cvs.height, region.width);
      }
    } catch (err) {
      console.error('Capture failed:', err);
      alert('Could not capture the map. Try using the "Upload Map" option instead.');
    }

    setCapturing(false);
  }, [onCapture, region]);

  const handleZoom = useCallback((delta: number) => {
    if (mapInstance.current) {
      const current = mapInstance.current.getZoom();
      mapInstance.current.zoomTo(Math.max(14, Math.min(22, current + delta)), { duration: 200 });
    }
  }, []);

  // Compute live region dimensions using map.unproject for accuracy
  const regionDims = (() => {
    const map = mapInstance.current;
    if (!map) {
      // Fallback before map loads
      const mpp = metersPerPxAtZoom(currentZoom, currentLat);
      return { widthM: mpp * region.width, heightM: mpp * region.height };
    }
    const tl = map.unproject([region.x, region.y]);
    const tr = map.unproject([region.x + region.width, region.y]);
    const bl = map.unproject([region.x, region.y + region.height]);
    const R = 6371000;
    const dLonW = ((tr.lng - tl.lng) * Math.PI) / 180;
    const lat1 = (tl.lat * Math.PI) / 180;
    const lat2 = (tr.lat * Math.PI) / 180;
    const aW = Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLonW / 2) ** 2;
    const widthM = R * 2 * Math.atan2(Math.sqrt(aW), Math.sqrt(1 - aW));
    const dLatH = ((bl.lat - tl.lat) * Math.PI) / 180;
    const aH = Math.sin(dLatH / 2) ** 2;
    const heightM = R * 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
    return { widthM, heightM };
  })();
  const regionWidthM = regionDims.widthM;
  const regionHeightM = regionDims.heightM;

  const fmtDist = (m: number) => formatDistance(m, unitSystem);

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-card border border-border rounded-lg p-6 max-w-md text-center space-y-3">
          <p className="text-destructive font-medium">Failed to load map</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    );
  }

  // Resize handle component
  const ResizeHandle = ({ position, cursor }: { position: string; cursor: string }) => {
    const style: React.CSSProperties = { position: 'absolute', cursor };
    const size = 10;
    if (position.includes('n')) { style.top = -size / 2; style.height = size; }
    if (position.includes('s')) { style.bottom = -size / 2; style.height = size; }
    if (position.includes('e')) { style.right = -size / 2; style.width = size; }
    if (position.includes('w')) { style.left = -size / 2; style.width = size; }
    if (position === 'n' || position === 's') { style.left = size; style.right = size; }
    if (position === 'e' || position === 'w') { style.top = size; style.bottom = size; }
    if (position.length === 2) { style.width = size * 2; style.height = size * 2; }

    return (
      <div
        style={style}
        className="z-10"
        onMouseDown={(e) => handleRegionMouseDown(e, position)}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-border bg-card flex items-center gap-3 px-4">
        <Satellite className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Satellite Venue Capture</h2>
        <div className="flex-1" />

        {/* Region dimensions */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mr-4">
          <Ruler className="w-3.5 h-3.5" />
          <span className="font-mono">{fmtDist(regionWidthM)} × {fmtDist(regionHeightM)}</span>
          <span className="text-border">|</span>
          <span className="font-mono">{formatScale(mpp, unitSystem)}</span>
          <button
            onClick={() => setUnitSystem(u => u === 'imperial' ? 'metric' : 'imperial')}
            className="ml-1 px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-foreground text-[10px] font-medium uppercase tracking-wide"
          >
            {unitSystem === 'imperial' ? 'ft' : 'm'}
          </button>
        </div>

        {placeName && (
          <div className="flex items-center gap-1.5 text-xs mr-4">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground truncate max-w-48">{placeName}</span>
          </div>
        )}

        <div className="flex items-center gap-1 mr-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleZoom(-0.5)}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground w-10 text-center">{currentZoom.toFixed(1)}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleZoom(0.5)}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
        </div>

        <Button
          size="sm"
          onClick={handleCapture}
          disabled={capturing || !loaded}
          className="gap-1.5"
        >
          {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Capture Selection
        </Button>

        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Search bar */}
      <div className="px-4 py-2 bg-card/50 border-b border-border">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search venue address..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-20 overflow-hidden">
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors border-b border-border/50 last:border-0 flex items-start gap-2"
                  onClick={() => handleSelectPlace(result)}
                >
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-foreground">{result.place_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map + selection overlay */}
      <div className="flex-1 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading satellite imagery...</span>
            </div>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />

        {/* Dimmed overlay outside selection region */}
        {loaded && (
          <>
            {/* Top */}
            <div className="absolute inset-x-0 top-0 bg-black/50 pointer-events-none" style={{ height: region.y }} />
            {/* Bottom */}
            <div className="absolute inset-x-0 bg-black/50 pointer-events-none" style={{ top: region.y + region.height, bottom: 0 }} />
            {/* Left */}
            <div className="absolute bg-black/50 pointer-events-none" style={{ top: region.y, left: 0, width: region.x, height: region.height }} />
            {/* Right */}
            <div className="absolute bg-black/50 pointer-events-none" style={{ top: region.y, left: region.x + region.width, right: 0, height: region.height }} />

            {/* Selection border + handles */}
            <div
              className="absolute border-2 border-primary"
              style={{
                left: region.x,
                top: region.y,
                width: region.width,
                height: region.height,
              }}
            >
              {/* Move handle in center */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary/80 flex items-center justify-center cursor-move shadow-lg"
                onMouseDown={(e) => handleRegionMouseDown(e, 'move')}
              >
                <Move className="w-4 h-4 text-primary-foreground" />
              </div>

              {/* Dimension labels */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-mono px-2 py-0.5 rounded whitespace-nowrap">
                {fmtDist(regionWidthM)}
              </div>
              <div className="absolute -right-14 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-xs font-mono px-2 py-0.5 rounded whitespace-nowrap">
                {fmtDist(regionHeightM)}
              </div>

              {/* Corner handles */}
              <ResizeHandle position="nw" cursor="nw-resize" />
              <ResizeHandle position="ne" cursor="ne-resize" />
              <ResizeHandle position="sw" cursor="sw-resize" />
              <ResizeHandle position="se" cursor="se-resize" />
              {/* Edge handles */}
              <ResizeHandle position="n" cursor="n-resize" />
              <ResizeHandle position="s" cursor="s-resize" />
              <ResizeHandle position="e" cursor="e-resize" />
              <ResizeHandle position="w" cursor="w-resize" />
            </div>
          </>
        )}
      </div>

      {/* Footer hints */}
      <div className="h-10 border-t border-border bg-card/50 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <span>Drag the selection box to frame your venue</span>
        <span>Resize corners/edges to adjust capture area</span>
        <span>Zoom level: {currentZoom}</span>
      </div>
    </div>
  );
}
