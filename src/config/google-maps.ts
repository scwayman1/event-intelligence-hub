// Google Maps API key (read from environment variable)
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

export const GOOGLE_MAPS_LIBRARIES = ['places'] as const;
