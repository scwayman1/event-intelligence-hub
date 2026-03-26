import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Satellite, MapPin, Download, X, Loader2, Ruler, Move, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoogleMaps } from '@/hooks/use-google-maps';
import { GOOGLE_MAPS_API_KEY } from '@/config/google-maps';

interface VenueCaptureProps {
  onCapture: (imageDataUrl: string, metersPerPixel: number | null, imageWidth: number, imageHeight: number) => void;
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
  const { loaded, error } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(19);
  const [currentLat, setCurrentLat] = useState(0);
  const [placeName, setPlaceName] = useState('');

  // Capture region state
  const [region, setRegion] = useState<CaptureRegion>({ x: 100, y: 60, width: 600, height: 400 });
  const [regionDrag, setRegionDrag] = useState<{ type: 'move' | string; startMouseX: number; startMouseY: number; startRegion: CaptureRegion } | null>(null);

  // Initialize map
  useEffect(() => {
    if (!loaded || !mapRef.current || mapInstance.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 38.8977, lng: -77.0365 },
      zoom: 19,
      mapTypeId: 'satellite',
      tilt: 0,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      gestureHandling: 'greedy',
    });

    mapInstance.current = map;
    setCurrentLat(38.8977);

    map.addListener('zoom_changed', () => {
      setCurrentZoom(map.getZoom() || 19);
    });

    map.addListener('center_changed', () => {
      const center = map.getCenter();
      if (center) setCurrentLat(center.lat());
    });
  }, [loaded]);

  // Center the region when map container is available
  useEffect(() => {
    if (!mapRef.current) return;
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

  // Initialize Places Autocomplete
  useEffect(() => {
    if (!loaded || !searchInputRef.current || autocompleteRef.current) return;

    const autocomplete = new google.maps.places.Autocomplete(searchInputRef.current, {
      types: ['establishment', 'geocode'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location && mapInstance.current) {
        mapInstance.current.setCenter(place.geometry.location);
        mapInstance.current.setZoom(19);
        setPlaceName(place.name || place.formatted_address || '');
        setCurrentLat(place.geometry.location.lat());
      }
    });

    autocompleteRef.current = autocomplete;
  }, [loaded]);

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
    const mapDiv = mapRef.current;
    const zoom = map.getZoom();
    if (!zoom) { setCapturing(false); return; }

    // Convert region pixel bounds to lat/lng using the map projection
    const mapRect = mapDiv.getBoundingClientRect();
    const projection = map.getProjection();
    const bounds = map.getBounds();

    if (!projection || !bounds) {
      setCapturing(false);
      alert('Map not ready. Please wait and try again.');
      return;
    }

    // Get the region center in pixel coordinates relative to the map div
    const regionCenterXPx = region.x + region.width / 2;
    const regionCenterYPx = region.y + region.height / 2;

    // Convert map div pixel to world coordinates
    const scale = Math.pow(2, zoom);
    const nw = projection.fromLatLngToPoint(new google.maps.LatLng(bounds.getNorthEast().lat(), bounds.getSouthWest().lng()));
    if (!nw) { setCapturing(false); return; }

    const worldX = nw.x + regionCenterXPx / scale;
    const worldY = nw.y + regionCenterYPx / scale;
    const centerLatLng = projection.fromPointToLatLng(new google.maps.Point(worldX, worldY));
    if (!centerLatLng) { setCapturing(false); return; }

    // Static Maps: max 640x640 at scale=2 gives 1280x1280 actual pixels
    const captureW = Math.min(640, Math.round(region.width));
    const captureH = Math.min(640, Math.round(region.height));

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = img.naturalWidth;
      cvs.height = img.naturalHeight;
      const ctx = cvs.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      const dataUrl = cvs.toDataURL('image/png');
      const mpp = metersPerPxAtZoom(zoom, centerLatLng.lat()) / 2; // scale=2
      onCapture(dataUrl, mpp, img.naturalWidth, img.naturalHeight);
      setCapturing(false);
    };
    img.onerror = () => {
      // Fallback: try canvas capture of the visible region
      const canvas = mapDiv.querySelector('canvas');
      if (canvas) {
        try {
          const cvs = document.createElement('canvas');
          const dpr = window.devicePixelRatio || 1;
          cvs.width = region.width * dpr;
          cvs.height = region.height * dpr;
          const ctx = cvs.getContext('2d');
          ctx?.drawImage(canvas,
            region.x * dpr, region.y * dpr, region.width * dpr, region.height * dpr,
            0, 0, cvs.width, cvs.height
          );
          const dataUrl = cvs.toDataURL('image/png');
          const mpp = metersPerPxAtZoom(zoom, centerLatLng.lat());
          onCapture(dataUrl, mpp, cvs.width, cvs.height);
          setCapturing(false);
          return;
        } catch { /* tainted */ }
      }
      setCapturing(false);
      alert('Could not capture the map. Try using the "Upload Map" option instead.');
    };
    img.src = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLatLng.lat()},${centerLatLng.lng()}&zoom=${zoom}&size=${captureW}x${captureH}&scale=2&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`;
  }, [onCapture, region]);

  const mpp = metersPerPxAtZoom(currentZoom, currentLat);
  const regionWidthM = mpp * region.width;
  const regionHeightM = mpp * region.height;

  const formatDist = (m: number) => m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;

  if (error) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
        <div className="bg-card border border-border rounded-lg p-6 max-w-md text-center space-y-3">
          <p className="text-destructive font-medium">Failed to load Google Maps</p>
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
          <span className="font-mono">{formatDist(regionWidthM)} × {formatDist(regionHeightM)}</span>
          <span className="text-border">|</span>
          <span className="font-mono">{mpp.toFixed(2)} m/px</span>
        </div>

        {placeName && (
          <div className="flex items-center gap-1.5 text-xs mr-4">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground truncate max-w-48">{placeName}</span>
          </div>
        )}

        <div className="flex items-center gap-1 mr-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (mapInstance.current) { const z = (mapInstance.current.getZoom() || 19) - 1; mapInstance.current.setZoom(Math.max(z, 15)); } }}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs font-mono text-muted-foreground w-8 text-center">{currentZoom}</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (mapInstance.current) { const z = (mapInstance.current.getZoom() || 19) + 1; mapInstance.current.setZoom(Math.min(z, 22)); } }}>
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
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Map + selection overlay */}
      <div className="flex-1 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading Google Maps...</span>
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
                {formatDist(regionWidthM)}
              </div>
              <div className="absolute -right-14 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground text-xs font-mono px-2 py-0.5 rounded whitespace-nowrap">
                {formatDist(regionHeightM)}
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
