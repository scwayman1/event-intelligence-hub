import { useState, useEffect } from 'react';
import { GOOGLE_MAPS_API_KEY } from '@/config/google-maps';

declare global {
  interface Window {
    google?: {
      maps?: typeof google.maps;
    };
  }
}

let loadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (window.google?.maps) return Promise.resolve();

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function useGoogleMaps() {
  const [loaded, setLoaded] = useState(!!window.google?.maps);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    loadGoogleMapsScript()
      .then(() => setLoaded(true))
      .catch((err) => setError(err.message));
  }, [loaded]);

  return { loaded, error };
}
