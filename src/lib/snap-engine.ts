/**
 * Smart object-to-object snapping engine.
 * Pure functions -- no React dependency.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SnapCandidate {
  axis: 'x' | 'y';
  snappedValue: number;
  guidePosition: number;
  type: 'edge' | 'center' | 'equal-spacing';
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapCandidate[];
}

export interface SnapRect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the 3 notable positions along an axis for a rect. */
function edgeValues(pos: number, size: number): [number, number, number] {
  return [pos, pos + size / 2, pos + size]; // start, center, end
}

// ─── snapToObjects ────────────────────────────────────────────────────────────

/**
 * Check all 6 edges of the moving object (left, right, centerX, top, bottom,
 * centerY) against all 6 edges of every other object. If any edge pair is
 * within `threshold` pixels, snap to it. Returns the snapped position and all
 * active guide lines.
 */
export function snapToObjects(
  movingObj: SnapRect,
  allObjects: SnapRect[],
  threshold: number = 5,
): SnapResult {
  const guides: SnapCandidate[] = [];

  // Best snap candidates per axis (closest distance wins)
  let bestDx: number | null = null;
  let bestDistX = Infinity;
  let bestDy: number | null = null;
  let bestDistY = Infinity;

  const movingXEdges = edgeValues(movingObj.x, movingObj.width);   // left, centerX, right
  const movingYEdges = edgeValues(movingObj.y, movingObj.height);  // top, centerY, bottom

  for (const other of allObjects) {
    if (other.id !== undefined && other.id === (movingObj as SnapRect).id) continue;

    const otherXEdges = edgeValues(other.x, other.width);
    const otherYEdges = edgeValues(other.y, other.height);

    // Check X axis (horizontal snapping)
    for (const mx of movingXEdges) {
      for (const ox of otherXEdges) {
        const dist = Math.abs(mx - ox);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          bestDx = ox - mx; // delta to apply
        }
      }
    }

    // Check Y axis (vertical snapping)
    for (const my of movingYEdges) {
      for (const oy of otherYEdges) {
        const dist = Math.abs(my - oy);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          bestDy = oy - my;
        }
      }
    }
  }

  const snappedX = bestDx !== null ? movingObj.x + bestDx : movingObj.x;
  const snappedY = bestDy !== null ? movingObj.y + bestDy : movingObj.y;

  // Build guide lines for all edges that now align after snapping
  const snappedXEdges = edgeValues(snappedX, movingObj.width);
  const snappedYEdges = edgeValues(snappedY, movingObj.height);

  for (const other of allObjects) {
    if (other.id !== undefined && other.id === (movingObj as SnapRect).id) continue;

    const otherXEdges = edgeValues(other.x, other.width);
    const otherYEdges = edgeValues(other.y, other.height);

    for (let i = 0; i < snappedXEdges.length; i++) {
      for (const ox of otherXEdges) {
        if (Math.abs(snappedXEdges[i] - ox) < 0.5) {
          guides.push({
            axis: 'x',
            snappedValue: snappedX,
            guidePosition: ox,
            type: i === 1 ? 'center' : 'edge',
          });
        }
      }
    }

    for (let i = 0; i < snappedYEdges.length; i++) {
      for (const oy of otherYEdges) {
        if (Math.abs(snappedYEdges[i] - oy) < 0.5) {
          guides.push({
            axis: 'y',
            snappedValue: snappedY,
            guidePosition: oy,
            type: i === 1 ? 'center' : 'edge',
          });
        }
      }
    }
  }

  return { x: snappedX, y: snappedY, guides };
}

// ─── snapToEqualSpacing ───────────────────────────────────────────────────────

/**
 * Detect when the gap between A-B equals the gap between B-C (where B is the
 * moving object). Checks both horizontal and vertical gaps.
 */
export function snapToEqualSpacing(
  movingObj: SnapRect,
  neighbors: SnapRect[],
  threshold: number = 5,
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  if (neighbors.length < 2) return candidates;

  // For each axis, sort neighbors and look for equal-spacing opportunities
  for (const axis of ['x', 'y'] as const) {
    const posKey = axis;
    const sizeKey = axis === 'x' ? 'width' : 'height';

    // All objects including moving, sorted by position on this axis
    const allSorted = [...neighbors].sort((a, b) => a[posKey] - b[posKey]);

    // Compute gaps between consecutive sorted neighbors
    // Then check if placing movingObj between any pair creates equal spacing
    for (let i = 0; i < allSorted.length - 1; i++) {
      const objA = allSorted[i];
      const objB = allSorted[i + 1];

      const gapAB = objB[posKey] - (objA[posKey] + objA[sizeKey]);

      // Check: movingObj sits before objA (so gap from moving->A == gap A->B)
      {
        const movingEnd = movingObj[posKey] + movingObj[sizeKey];
        const gapMovingA = objA[posKey] - movingEnd;
        if (Math.abs(gapMovingA - gapAB) <= threshold && gapMovingA > 0) {
          const idealEnd = objA[posKey] - gapAB;
          candidates.push({
            axis,
            snappedValue: idealEnd - movingObj[sizeKey],
            guidePosition: idealEnd,
            type: 'equal-spacing',
          });
        }
      }

      // Check: movingObj sits after objB (so gap A->B == gap B->moving)
      {
        const bEnd = objB[posKey] + objB[sizeKey];
        const gapBMoving = movingObj[posKey] - bEnd;
        if (Math.abs(gapBMoving - gapAB) <= threshold && gapBMoving > 0) {
          const idealPos = bEnd + gapAB;
          candidates.push({
            axis,
            snappedValue: idealPos,
            guidePosition: idealPos,
            type: 'equal-spacing',
          });
        }
      }

      // Check: movingObj sits between objA and objB (equal gaps on both sides)
      {
        const aEnd = objA[posKey] + objA[sizeKey];
        const totalGap = objB[posKey] - aEnd;
        const idealGap = (totalGap - movingObj[sizeKey]) / 2;
        if (idealGap > 0) {
          const idealPos = aEnd + idealGap;
          if (Math.abs(movingObj[posKey] - idealPos) <= threshold) {
            candidates.push({
              axis,
              snappedValue: idealPos,
              guidePosition: idealPos + movingObj[sizeKey] / 2,
              type: 'equal-spacing',
            });
          }
        }
      }
    }
  }

  return candidates;
}

// ─── computeSnapGuides ────────────────────────────────────────────────────────

/**
 * Extracts renderable guide lines from a snap result.
 * Deduplicates guides at the same position on the same axis.
 */
export function computeSnapGuides(
  result: SnapResult,
): { axis: 'x' | 'y'; position: number; type: string }[] {
  const seen = new Set<string>();
  const guides: { axis: 'x' | 'y'; position: number; type: string }[] = [];

  for (const g of result.guides) {
    const key = `${g.axis}:${g.guidePosition}`;
    if (seen.has(key)) continue;
    seen.add(key);
    guides.push({
      axis: g.axis,
      position: g.guidePosition,
      type: g.type,
    });
  }

  return guides;
}
