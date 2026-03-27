// Google Maps API key – publishable client-side key (restricted by HTTP referrer).
// Can be overridden via VITE_GOOGLE_MAPS_API_KEY env var.
export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDGbutujNpUL9HtoCB4C0ZDl2O9Dkek4Zg';

export const GOOGLE_MAPS_LIBRARIES = ['places'] as const;
