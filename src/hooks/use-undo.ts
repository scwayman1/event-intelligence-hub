import { useCallback, useRef, useState } from 'react';
import type { LayoutObject } from '@/types/events';

const MAX_HISTORY = 50;

export function useUndo(currentObjects: LayoutObject[]) {
  const undoStackRef = useRef<LayoutObject[][]>([]);
  const redoStackRef = useRef<LayoutObject[][]>([]);
  // version counter to trigger re-renders when stacks change
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const currentRef = useRef<LayoutObject[]>(currentObjects);
  currentRef.current = currentObjects;

  const pushState = useCallback((snapshot: LayoutObject[]) => {
    undoStackRef.current = [...undoStackRef.current, snapshot];
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current = undoStackRef.current.slice(-MAX_HISTORY);
    }
    // Any new action clears the redo stack
    redoStackRef.current = [];
    bump();
  }, []);

  const undo = useCallback((): LayoutObject[] | null => {
    if (undoStackRef.current.length === 0) return null;
    const stack = [...undoStackRef.current];
    const popped = stack.pop()!;
    undoStackRef.current = stack;
    // Push current state onto redo stack
    redoStackRef.current = [...redoStackRef.current, currentRef.current];
    bump();
    return popped;
  }, []);

  const redo = useCallback((): LayoutObject[] | null => {
    if (redoStackRef.current.length === 0) return null;
    const stack = [...redoStackRef.current];
    const popped = stack.pop()!;
    redoStackRef.current = stack;
    // Push current state onto undo stack
    undoStackRef.current = [...undoStackRef.current, currentRef.current];
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current = undoStackRef.current.slice(-MAX_HISTORY);
    }
    bump();
    return popped;
  }, []);

  return {
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    pushState,
  };
}
