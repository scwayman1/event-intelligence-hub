import { useState, useCallback, useEffect, useMemo } from 'react';

const MAX_STACK_SIZE = 50;

export interface UseUndoRedoReturn<T> {
  pushState: (state: T) => void;
  undo: () => T | null;
  redo: () => T | null;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(
  onRestore?: (state: T) => void
): UseUndoRedoReturn<T> {
  const [undoStack, setUndoStack] = useState<T[]>([]);
  const [redoStack, setRedoStack] = useState<T[]>([]);

  const pushState = useCallback((state: T) => {
    setUndoStack((prev) => {
      const next = [...prev, state];
      if (next.length > MAX_STACK_SIZE) {
        return next.slice(next.length - MAX_STACK_SIZE);
      }
      return next;
    });
    // Clear redo stack on new action
    setRedoStack([]);
  }, []);

  const undo = useCallback((): T | null => {
    let restored: T | null = null;

    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const state = next.pop()!;
      restored = state;
      setRedoStack((r) => [...r, state]);
      return next;
    });

    if (restored !== null && onRestore) {
      onRestore(restored);
    }

    return restored;
  }, [onRestore]);

  const redo = useCallback((): T | null => {
    let restored: T | null = null;

    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const state = next.pop()!;
      restored = state;
      setUndoStack((u) => [...u, state]);
      return next;
    });

    if (restored !== null && onRestore) {
      onRestore(restored);
    }

    return restored;
  }, [onRestore]);

  // Keyboard shortcut registration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.key === 'z' && e.shiftKey) ||
        (e.key === 'y' && !e.shiftKey)
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return useMemo(
    () => ({ pushState, undo, redo, canUndo, canRedo }),
    [pushState, undo, redo, canUndo, canRedo]
  );
}
