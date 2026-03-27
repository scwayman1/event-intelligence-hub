import { useState, useEffect, useRef } from 'react';
import { Check, Cloud, Loader2 } from 'lucide-react';
import { useEventStore } from '@/data/store';

export function SaveIndicator() {
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const initialRef = useRef(true);

  // Watch all persisted data slices for changes
  const events = useEventStore((s) => s.events);
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);
  const seatingRules = useEventStore((s) => s.seatingRules);

  useEffect(() => {
    // Skip the initial render (hydration from localStorage)
    if (initialRef.current) {
      initialRef.current = false;
      return;
    }

    setStatus('saving');

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Zustand persist writes synchronously on state change,
    // so after a short debounce we can show "Saved"
    timeoutRef.current = setTimeout(() => {
      setStatus('saved');
    }, 600);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [events, guests, versions, layoutObjects, seatingAssignments, seatingRules]);

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium select-none">
      {status === 'saved' && (
        <>
          <Check className="w-3 h-3 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400">Saved</span>
        </>
      )}
      {status === 'saving' && (
        <>
          <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
          <span className="text-blue-600 dark:text-blue-400">Saving...</span>
        </>
      )}
      {status === 'unsaved' && (
        <>
          <Cloud className="w-3 h-3 text-yellow-500" />
          <span className="text-yellow-600 dark:text-yellow-400">Unsaved changes</span>
        </>
      )}
    </div>
  );
}
