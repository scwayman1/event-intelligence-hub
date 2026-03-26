import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Satellite, MapPin, Download, X, Loader2, Ruler } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoogleMaps } from '@/hooks/use-google-maps';
import { GOOGLE_MAPS_API_KEY } from '@/config/google-maps';

interface VenueCaptureProps {
  onCapture: (imageDataUrl: string, metersPerPixel: number | null) => void;
  onClose: () => void;
}

// Approximate meters-per-pixel at the equator for each zoom level
function metersPerPxAtZoom(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
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

  // Initialize map
  useEffect(() => {
    if (!loaded || !mapRef.current || mapInstance.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: 38.8977, lng: -77.0365 }, // Default: White House
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

  const handleCapture = useCallback(() => {
    if (!mapInstance.current || !mapRef.current) return;
    setCapturing(true);

    // Use the Static Maps API for a clean capture
    const center = mapInstance.current.getCenter();
    const zoom = mapInstance.current.getZoom();
    if (!center || !zoom) { setCapturing(false); return; }

    const width = mapRef.current.clientWidth;
    const height = mapRef.current.clientHeight;
    // Static Maps max is 640x640 without premium, use 2x scale
    const staticW = Math.min(640, width);
    const staticH = Math.min(640, height);

    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat()},${center.lng()}&zoom=${zoom}&size=${staticW}x${staticH}&scale=2&maptype=satellite&key=${(window as any).__GMAPS_KEY || ''}`;

    // Fallback: capture canvas directly
    // The Static API requires the key in the URL; let's use canvas capture instead
    const canvas = mapRef.current.querySelector('canvas');
    if (canvas) {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const mpp = metersPerPxAtZoom(zoom, center.lat());
        onCapture(dataUrl, mpp);
        setCapturing(false);
        return;
      } catch {
        // Canvas tainted, fall through
      }
    }

    // Use html2canvas-style approach: capture via static maps API
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = img.naturalWidth;
      cvs.height = img.naturalHeight;
      const ctx = cvs.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      const dataUrl = cvs.toDataURL('image/png');
      const mpp = metersPerPxAtZoom(zoom, center.lat());
      onCapture(dataUrl, mpp);
      setCapturing(false);
    };
    img.onerror = () => {
      setCapturing(false);
      alert('Could not capture the map. Try using the "Upload Map" option instead.');
    };
    // Build static maps URL with the key from config
    const { GOOGLE_MAPS_API_KEY } = require('@/config/google-maps');
    img.src = `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat()},${center.lng()}&zoom=${zoom}&size=${staticW}x${staticH}&scale=2&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`;
  }, [onCapture]);

  const mpp = metersPerPxAtZoom(currentZoom, currentLat);
  const canvasWidth = mapRef.current?.clientWidth || 800;
  const viewWidthMeters = mpp * canvasWidth;

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

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-border bg-card flex items-center gap-3 px-4">
        <Satellite className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Satellite Venue Capture</h2>
        <div className="flex-1" />

        {/* Scale indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mr-4">
          <Ruler className="w-3.5 h-3.5" />
          <span className="font-mono">{viewWidthMeters < 1000 ? `${Math.round(viewWidthMeters)}m` : `${(viewWidthMeters / 1000).toFixed(1)}km`} across</span>
          <span className="text-border">|</span>
          <span className="font-mono">{mpp.toFixed(2)} m/px</span>
        </div>

        {placeName && (
          <div className="flex items-center gap-1.5 text-xs mr-4">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground truncate max-w-48">{placeName}</span>
          </div>
        )}

        <Button
          size="sm"
          onClick={handleCapture}
          disabled={capturing || !loaded}
          className="gap-1.5"
        >
          {capturing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Use as Venue Map
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

      {/* Map */}
      <div className="flex-1 relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading Google Maps...</span>
            </div>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* Footer hints */}
      <div className="h-10 border-t border-border bg-card/50 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <span>Scroll to zoom • Drag to pan</span>
        <span>Zoom in for higher detail and better scale accuracy</span>
        <span>Zoom level: {currentZoom}</span>
      </div>
    </div>
  );
}
