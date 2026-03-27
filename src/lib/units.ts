export type UnitSystem = 'imperial' | 'metric';

const METERS_TO_FEET = 3.28084;
const FEET_TO_METERS = 1 / METERS_TO_FEET;

/** Convert feet to meters */
export function feetToMeters(feet: number): number {
  return feet * FEET_TO_METERS;
}

/** Convert meters to feet */
export function metersToFeet(meters: number): number {
  return meters * METERS_TO_FEET;
}

/** Format a distance given in meters for display */
export function formatDistance(meters: number, system: UnitSystem): string {
  if (system === 'imperial') {
    const feet = meters * METERS_TO_FEET;
    if (feet < 1) return `${Math.round(feet * 12)}in`;
    if (feet >= 5280) return `${(feet / 5280).toFixed(1)}mi`;
    return `${feet.toFixed(1)}ft`;
  }
  if (meters < 1) return `${Math.round(meters * 100)}cm`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}km`;
  return `${meters.toFixed(1)}m`;
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

/** Convert real-world dimension (in current unit system) to meters */
export function userInputToMeters(value: number, system: UnitSystem): number {
  return system === 'imperial' ? feetToMeters(value) : value;
}

/** Convert meters to display value in current unit system */
export function metersToUserUnit(meters: number, system: UnitSystem): number {
  return system === 'imperial' ? metersToFeet(meters) : meters;
}

/** Format a dimension with unit suffix */
export function formatWithUnit(value: number, system: UnitSystem): string {
  return system === 'imperial' ? `${value.toFixed(1)}ft` : `${value.toFixed(1)}m`;
}
