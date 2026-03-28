import { useState, useCallback, useMemo } from 'react';

export interface UseSelectionManagerReturn {
  selectedIds: Set<string>;
  selectOne: (id: string) => void;
  toggleSelect: (id: string) => void;
  selectArea: (
    rect: { x: number; y: number; width: number; height: number },
    objects: { id: string; x: number; y: number; width: number; height: number }[]
  ) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  hasSelection: boolean;
  selectionCount: number;
}

function rectsIntersect(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function useSelectionManager(): UseSelectionManagerReturn {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectOne = useCallback((id: string) => {
    setSelectedIds(new Set([id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectArea = useCallback(
    (
      rect: { x: number; y: number; width: number; height: number },
      objects: { id: string; x: number; y: number; width: number; height: number }[]
    ) => {
      const hits = new Set<string>();
      for (const obj of objects) {
        if (rectsIntersect(rect, obj)) {
          hits.add(obj.id);
        }
      }
      setSelectedIds(hits);
    },
    []
  );

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const hasSelection = selectedIds.size > 0;
  const selectionCount = selectedIds.size;

  return useMemo(
    () => ({
      selectedIds,
      selectOne,
      toggleSelect,
      selectArea,
      selectAll,
      clearSelection,
      isSelected,
      hasSelection,
      selectionCount,
    }),
    [
      selectedIds,
      selectOne,
      toggleSelect,
      selectArea,
      selectAll,
      clearSelection,
      isSelected,
      hasSelection,
      selectionCount,
    ]
  );
}
