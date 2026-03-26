export type UnitSystem = 'imperial' | 'metric';

const METERS_TO_FEET = 3.28084;

/** Format a distance given in meters for display */
export function formatDistance(meters: number, system: UnitSystem): string {
  if (system === 'imperial') {
    const feet = meters * METERS_TO_FEET;
    if (feet < 1) return `${Math.round(feet * 12)}in`;
    if (feet >= 5280) return `${(feet / 5280).toFixed(1)}mi`;
    return `${Math.round(feet)}ft`;
  }
  if (meters < 1) return `${Math.round(meters * 100)}cm`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters)}m`;
}

/** Format meters-per-pixel for display */
export function formatScale(mpp: number, system: UnitSystem): string {
  if (system === 'imperial') {
    return `${(mpp * METERS_TO_FEET).toFixed(2)} ft/px`;
  }
  return `${mpp.toFixed(2)} m/px`;
}

/** Format a dimension (pixels → real world) */
export function formatDimension(px: number, metersPerPixel: number | null, system: UnitSystem): string {
  if (!metersPerPixel) return `${px}px`;
  const meters = px * metersPerPixel;
  return formatDistance(meters, system);
}
