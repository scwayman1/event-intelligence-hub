import type { ObjectPreset } from './layout-presets';

export interface RoomBounds {
  widthMeters: number;
  heightMeters: number;
}

export interface FitResult {
  cols: number;
  rows: number;
  total: number;
  totalCapacity: number;
  usedArea: number;
  totalArea: number;
  utilization: number;
}

/**
 * Calculate how many of a given table/object can fit in a room,
 * accounting for spacing between objects and from walls.
 */
export function calculateTableFit(
  room: RoomBounds,
  preset: ObjectPreset,
  spacingMeters: number = 1.2, // default ~4ft aisle spacing
  wallMarginMeters: number = 0.9, // default ~3ft wall margin
): FitResult {
  const usableW = room.widthMeters - 2 * wallMarginMeters;
  const usableH = room.heightMeters - 2 * wallMarginMeters;

  if (usableW <= 0 || usableH <= 0) {
    return { cols: 0, rows: 0, total: 0, totalCapacity: 0, usedArea: 0, totalArea: room.widthMeters * room.heightMeters, utilization: 0 };
  }

  const cellW = preset.widthMeters + spacingMeters;
  const cellH = preset.heightMeters + spacingMeters;

  const cols = Math.max(0, Math.floor((usableW + spacingMeters) / cellW));
  const rows = Math.max(0, Math.floor((usableH + spacingMeters) / cellH));
  const total = cols * rows;
  const totalCapacity = total * (preset.capacity ?? 0);
  const usedArea = total * preset.widthMeters * preset.heightMeters;
  const totalArea = room.widthMeters * room.heightMeters;
  const utilization = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;

  return { cols, rows, total, totalCapacity, usedArea, totalArea, utilization };
}

/**
 * Calculate the distance from an object's edges to the room boundary edges (in pixels).
 */
export function edgeDistances(
  objX: number, objY: number, objW: number, objH: number,
  canvasW: number, canvasH: number,
) {
  return {
    left: objX,
    top: objY,
    right: canvasW - (objX + objW),
    bottom: canvasH - (objY + objH),
  };
}

/**
 * Find the nearest object edge-to-edge distances for smart guides.
 */
export function nearestEdgeDistances(
  obj: { x: number; y: number; width: number; height: number; id: string },
  others: { x: number; y: number; width: number; height: number; id: string }[],
): { nearest: { id: string; distance: number; direction: string } | null; alignments: { id: string; axis: 'h' | 'v'; position: number }[] } {
  let nearest: { id: string; distance: number; direction: string } | null = null;
  const alignments: { id: string; axis: 'h' | 'v'; position: number }[] = [];

  const objCX = obj.x + obj.width / 2;
  const objCY = obj.y + obj.height / 2;

  for (const other of others) {
    if (other.id === obj.id) continue;

    const otherCX = other.x + other.width / 2;
    const otherCY = other.y + other.height / 2;

    // Edge-to-edge horizontal gap
    const gapLeft = obj.x - (other.x + other.width);
    const gapRight = other.x - (obj.x + obj.width);
    const gapTop = obj.y - (other.y + other.height);
    const gapBottom = other.y - (obj.y + obj.height);

    const hGap = Math.max(gapLeft, gapRight);
    const vGap = Math.max(gapTop, gapBottom);

    // Find smallest positive gap (no overlap)
    const gaps = [
      { d: gapLeft, dir: 'left' },
      { d: gapRight, dir: 'right' },
      { d: gapTop, dir: 'top' },
      { d: gapBottom, dir: 'bottom' },
    ].filter(g => g.d > 0);

    for (const g of gaps) {
      if (!nearest || g.d < nearest.distance) {
        nearest = { id: other.id, distance: g.d, direction: g.dir };
      }
    }

    // Check center alignment (within 3px tolerance)
    if (Math.abs(objCX - otherCX) < 3) {
      alignments.push({ id: other.id, axis: 'v', position: otherCX });
    }
    if (Math.abs(objCY - otherCY) < 3) {
      alignments.push({ id: other.id, axis: 'h', position: otherCY });
    }
  }

  return { nearest, alignments };
}
