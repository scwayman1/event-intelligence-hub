// Logic for treating tents as containers for tables.

import type { LayoutObject } from '@/types/events';

/**
 * Returns the tent whose bounds fully contain the object, or null.
 */
export function findContainingTent(
  obj: LayoutObject,
  tents: LayoutObject[],
): LayoutObject | null {
  for (const tent of tents) {
    if (
      obj.x >= tent.x &&
      obj.y >= tent.y &&
      obj.x + obj.width <= tent.x + tent.width &&
      obj.y + obj.height <= tent.y + tent.height
    ) {
      return tent;
    }
  }
  return null;
}

/**
 * Computes the overlap area between two rectangles.
 */
function overlapArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const overlapX = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const overlapY = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  return overlapX * overlapY;
}

/**
 * Returns all objects visually inside the tent boundary (>50% overlap).
 */
export function getContainedObjects(
  tent: LayoutObject,
  allObjects: LayoutObject[],
): LayoutObject[] {
  return allObjects.filter((obj) => {
    if (obj.id === tent.id) return false;
    const objArea = obj.width * obj.height;
    if (objArea === 0) return false;
    const overlap = overlapArea(obj, tent);
    return overlap / objArea > 0.5;
  });
}

/**
 * When a tent moves by (dx, dy), returns new positions for all contained objects.
 */
export function moveContainedObjects(
  tent: LayoutObject,
  dx: number,
  dy: number,
  allObjects: LayoutObject[],
): { id: string; x: number; y: number }[] {
  const contained = getContainedObjects(tent, allObjects);
  return contained.map((obj) => ({
    id: obj.id,
    x: obj.x + dx,
    y: obj.y + dy,
  }));
}

const PADDING = 5;

/**
 * Clamps an object position to stay within tent bounds (with 5px padding).
 */
export function constrainToTent(
  position: { x: number; y: number; width: number; height: number },
  tent: LayoutObject,
): { x: number; y: number } {
  const minX = tent.x + PADDING;
  const minY = tent.y + PADDING;
  const maxX = tent.x + tent.width - position.width - PADDING;
  const maxY = tent.y + tent.height - position.height - PADDING;

  return {
    x: Math.min(Math.max(position.x, minX), maxX),
    y: Math.min(Math.max(position.y, minY), maxY),
  };
}
