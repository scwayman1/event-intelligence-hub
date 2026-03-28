// Pure geometry functions for computing table layout patterns.
// No React dependency.

export interface ArrangeableObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrangementResult {
  id: string;
  x: number;
  y: number;
}

interface GridOptions {
  cols?: number;
  spacingX?: number;
  spacingY?: number;
  marginX?: number;
  marginY?: number;
  boundsWidth?: number;
  boundsHeight?: number;
}

/**
 * Grid layout with configurable columns, spacing, and margins.
 * Centers the grid within bounds if provided.
 * Auto-calculates columns if not specified (fit as many as possible).
 */
export function arrangeGrid(
  objects: ArrangeableObject[],
  options: GridOptions = {},
): ArrangementResult[] {
  if (objects.length === 0) return [];

  const {
    spacingX = 20,
    spacingY = 20,
    marginX = 0,
    marginY = 0,
    boundsWidth,
    boundsHeight,
  } = options;

  const maxW = Math.max(...objects.map((o) => o.width));
  const maxH = Math.max(...objects.map((o) => o.height));

  // Auto-calculate columns: fit as many as possible within bounds
  let cols = options.cols;
  if (cols === undefined) {
    if (boundsWidth !== undefined) {
      cols = Math.max(
        1,
        Math.floor((boundsWidth - 2 * marginX + spacingX) / (maxW + spacingX)),
      );
    } else {
      cols = Math.ceil(Math.sqrt(objects.length));
    }
  }

  const rows = Math.ceil(objects.length / cols);
  const gridTotalW = cols * maxW + (cols - 1) * spacingX;
  const gridTotalH = rows * maxH + (rows - 1) * spacingY;

  // Center within bounds if provided
  let offsetX = marginX;
  let offsetY = marginY;
  if (boundsWidth !== undefined) {
    offsetX = Math.max(marginX, (boundsWidth - gridTotalW) / 2);
  }
  if (boundsHeight !== undefined) {
    offsetY = Math.max(marginY, (boundsHeight - gridTotalH) / 2);
  }

  return objects.map((obj, i) => {
    const col = i % cols!;
    const row = Math.floor(i / cols!);
    return {
      id: obj.id,
      x: offsetX + col * (maxW + spacingX) + (maxW - obj.width) / 2,
      y: offsetY + row * (maxH + spacingY) + (maxH - obj.height) / 2,
    };
  });
}

interface CircleOptions {
  centerX: number;
  centerY: number;
  radius?: number;
  startAngle?: number;
}

/**
 * Circular arrangement, evenly spaced.
 * Auto-calculates radius from object count and size if not specified.
 */
export function arrangeCircle(
  objects: ArrangeableObject[],
  options: CircleOptions,
): ArrangementResult[] {
  if (objects.length === 0) return [];

  const { centerX, centerY, startAngle = -Math.PI / 2 } = options;

  // Auto-calculate radius: enough room so objects don't overlap
  let radius = options.radius;
  if (radius === undefined) {
    const maxDim = Math.max(...objects.map((o) => Math.max(o.width, o.height)));
    // Circumference must fit all objects with some spacing
    const minCircumference = objects.length * (maxDim + 20);
    radius = Math.max(maxDim, minCircumference / (2 * Math.PI));
  }

  const angleStep = (2 * Math.PI) / objects.length;

  return objects.map((obj, i) => {
    const angle = startAngle + i * angleStep;
    return {
      id: obj.id,
      x: centerX + radius * Math.cos(angle) - obj.width / 2,
      y: centerY + radius * Math.sin(angle) - obj.height / 2,
    };
  });
}

interface RowsOptions {
  spacingX?: number;
  spacingY?: number;
  stagger?: boolean;
  boundsWidth?: number;
  marginX?: number;
}

/**
 * Theater-style rows, optionally staggered (every other row offset by half-spacing).
 */
export function arrangeRows(
  objects: ArrangeableObject[],
  options: RowsOptions = {},
): ArrangementResult[] {
  if (objects.length === 0) return [];

  const {
    spacingX = 20,
    spacingY = 20,
    stagger = false,
    marginX = 0,
  } = options;

  const maxW = Math.max(...objects.map((o) => o.width));
  const maxH = Math.max(...objects.map((o) => o.height));
  const boundsWidth = options.boundsWidth ?? Infinity;

  const colsPerRow = Math.max(
    1,
    Math.floor((boundsWidth - 2 * marginX + spacingX) / (maxW + spacingX)),
  );

  const results: ArrangementResult[] = [];

  for (let i = 0; i < objects.length; i++) {
    const row = Math.floor(i / colsPerRow);
    const col = i % colsPerRow;
    const staggerOffset =
      stagger && row % 2 === 1 ? (maxW + spacingX) / 2 : 0;

    results.push({
      id: objects[i].id,
      x:
        marginX +
        col * (maxW + spacingX) +
        staggerOffset +
        (maxW - objects[i].width) / 2,
      y: marginX + row * (maxH + spacingY) + (maxH - objects[i].height) / 2,
    });
  }

  return results;
}

/**
 * Distributes objects with equal spacing between them along the specified axis.
 * Keeps the first and last objects in place, adjusts everything in between.
 */
export function distributeEqual(
  objects: ArrangeableObject[],
  axis: 'horizontal' | 'vertical',
): ArrangementResult[] {
  if (objects.length <= 2) {
    return objects.map((o) => ({ id: o.id, x: o.x, y: o.y }));
  }

  // Sort by position on the target axis
  const sorted = [...objects].sort((a, b) =>
    axis === 'horizontal' ? a.x - b.x : a.y - b.y,
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (axis === 'horizontal') {
    const totalSpan = last.x - first.x;
    const step = totalSpan / (sorted.length - 1);

    return sorted.map((obj, i) => ({
      id: obj.id,
      x: first.x + i * step,
      y: obj.y,
    }));
  } else {
    const totalSpan = last.y - first.y;
    const step = totalSpan / (sorted.length - 1);

    return sorted.map((obj, i) => ({
      id: obj.id,
      x: obj.x,
      y: first.y + i * step,
    }));
  }
}

/**
 * Aligns all objects to the specified edge of the bounding box.
 */
export function alignObjects(
  objects: ArrangeableObject[],
  edge: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV',
): ArrangementResult[] {
  if (objects.length === 0) return [];

  const minX = Math.min(...objects.map((o) => o.x));
  const maxX = Math.max(...objects.map((o) => o.x + o.width));
  const minY = Math.min(...objects.map((o) => o.y));
  const maxY = Math.max(...objects.map((o) => o.y + o.height));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return objects.map((obj) => {
    switch (edge) {
      case 'left':
        return { id: obj.id, x: minX, y: obj.y };
      case 'right':
        return { id: obj.id, x: maxX - obj.width, y: obj.y };
      case 'top':
        return { id: obj.id, x: obj.x, y: minY };
      case 'bottom':
        return { id: obj.id, x: obj.x, y: maxY - obj.height };
      case 'centerH':
        return { id: obj.id, x: midX - obj.width / 2, y: obj.y };
      case 'centerV':
        return { id: obj.id, x: obj.x, y: midY - obj.height / 2 };
    }
  });
}
