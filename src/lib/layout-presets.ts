import type { LayoutObjectType } from '@/types/events';

export interface ObjectPreset {
  label: string;
  type: LayoutObjectType;
  capacity?: number;
  widthMeters: number;
  heightMeters: number;
}

export const tablePresets: ObjectPreset[] = [
  { label: '60" Round (8)', type: 'round_table', capacity: 8, widthMeters: 1.52, heightMeters: 1.52 },
  { label: '72" Round (10)', type: 'round_table', capacity: 10, widthMeters: 1.83, heightMeters: 1.83 },
  { label: '6ft Banquet (6)', type: 'rect_table', capacity: 6, widthMeters: 1.83, heightMeters: 0.76 },
  { label: '8ft Banquet (8)', type: 'rect_table', capacity: 8, widthMeters: 2.44, heightMeters: 0.76 },
];

export const supportPresets: ObjectPreset[] = [
  { label: 'Check-In Desk', type: 'checkin', widthMeters: 2.44, heightMeters: 0.76 },
  { label: 'Bar', type: 'bar', widthMeters: 2.44, heightMeters: 0.76 },
  { label: 'Podium', type: 'podium', widthMeters: 0.6, heightMeters: 0.6 },
  { label: 'Tent 40x30', type: 'tent', widthMeters: 12, heightMeters: 9 },
  { label: 'Dance Floor', type: 'dance_floor', widthMeters: 6, heightMeters: 6 },
];

export function metersToPixels(meters: number, metersPerPixel: number | null, fallback: number) {
  if (!metersPerPixel) return fallback;
  return Math.round(meters / metersPerPixel);
}
