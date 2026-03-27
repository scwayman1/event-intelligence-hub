import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AppEvent, Guest, LayoutObject, EventVersion, SeatingAssignment, SeatingRule } from '@/types/events';
import { mockEvents, mockGuests, mockVersions, mockLayoutObjects, mockSeatingAssignments, mockSeatingRules } from './mock-data';

interface EventStore {
  events: AppEvent[];
  guests: Guest[];
  versions: EventVersion[];
  layoutObjects: LayoutObject[];
  seatingAssignments: SeatingAssignment[];
  seatingRules: SeatingRule[];

  // Event actions
  addEvent: (event: AppEvent) => void;
  updateEvent: (id: string, updates: Partial<AppEvent>) => void;

  // Guest actions
  addGuest: (guest: Guest) => void;
  updateGuest: (id: string, updates: Partial<Guest>) => void;
  removeGuest: (id: string) => void;

  // Layout actions
  addLayoutObject: (obj: LayoutObject) => void;
  updateLayoutObject: (id: string, updates: Partial<LayoutObject>) => void;
  removeLayoutObject: (id: string) => void;

  // Version actions
  addVersion: (version: EventVersion) => void;
  updateVersion: (id: string, updates: Partial<EventVersion>) => void;

  // Seating actions
  addSeatingAssignment: (assignment: SeatingAssignment) => void;
  removeSeatingAssignment: (id: string) => void;
  moveGuestToTable: (guestId: string, tableId: string, versionId: string) => void;

  // Selectors
  getEventGuests: (eventId: string) => Guest[];
  getEventVersions: (eventId: string) => EventVersion[];
  getVersionObjects: (versionId: string) => LayoutObject[];
  getVersionSeating: (versionId: string) => SeatingAssignment[];
  getEventRules: (eventId: string) => SeatingRule[];
  getTableGuests: (tableId: string, versionId: string) => Guest[];

  // Reset
  resetStore: () => void;
}

export const useEventStore = create<EventStore>()(
  persist(
    (set, get) => ({
  events: mockEvents,
  guests: mockGuests,
  versions: mockVersions,
  layoutObjects: mockLayoutObjects,
  seatingAssignments: mockSeatingAssignments,
  seatingRules: mockSeatingRules,

  addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  updateEvent: (id, updates) => set((s) => ({ events: s.events.map((e) => e.id === id ? { ...e, ...updates } : e) })),

  addGuest: (guest) => set((s) => ({ guests: [...s.guests, guest] })),
  updateGuest: (id, updates) => set((s) => ({ guests: s.guests.map((g) => g.id === id ? { ...g, ...updates } : g) })),
  removeGuest: (id) => set((s) => ({ guests: s.guests.filter((g) => g.id !== id) })),

  addLayoutObject: (obj) => set((s) => ({ layoutObjects: [...s.layoutObjects, obj] })),
  updateLayoutObject: (id, updates) => set((s) => ({ layoutObjects: s.layoutObjects.map((o) => o.id === id ? { ...o, ...updates } : o) })),
  removeLayoutObject: (id) => set((s) => ({ layoutObjects: s.layoutObjects.filter((o) => o.id !== id) })),

  addVersion: (version) => set((s) => ({ versions: [...s.versions, version] })),
  updateVersion: (id, updates) => set((s) => ({ versions: s.versions.map((v) => v.id === id ? { ...v, ...updates } : v) })),

  addSeatingAssignment: (a) => set((s) => ({ seatingAssignments: [...s.seatingAssignments, a] })),
  removeSeatingAssignment: (id) => set((s) => ({ seatingAssignments: s.seatingAssignments.filter((a) => a.id !== id) })),
  moveGuestToTable: (guestId, tableId, versionId) => set((s) => {
    const filtered = s.seatingAssignments.filter((a) => !(a.guestId === guestId && a.versionId === versionId));
    const newAssignment: SeatingAssignment = { id: `sa-${crypto.randomUUID()}`, versionId, guestId, tableId };
    return { seatingAssignments: [...filtered, newAssignment] };
  }),

  getEventGuests: (eventId) => get().guests.filter((g) => g.eventId === eventId),
  getEventVersions: (eventId) => get().versions.filter((v) => v.eventId === eventId),
  getVersionObjects: (versionId) => get().layoutObjects.filter((o) => o.versionId === versionId),
  getVersionSeating: (versionId) => get().seatingAssignments.filter((a) => a.versionId === versionId),
  getEventRules: (eventId) => get().seatingRules.filter((r) => r.eventId === eventId),
  getTableGuests: (tableId, versionId) => {
    const assignments = get().seatingAssignments.filter((a) => a.tableId === tableId && a.versionId === versionId);
    const guestIds = assignments.map((a) => a.guestId);
    return get().guests.filter((g) => guestIds.includes(g.id));
  },

  resetStore: () => {
    localStorage.removeItem('event-intelligence-hub-store');
    set({
      events: mockEvents,
      guests: mockGuests,
      versions: mockVersions,
      layoutObjects: mockLayoutObjects,
      seatingAssignments: mockSeatingAssignments,
      seatingRules: mockSeatingRules,
    });
  },
}),
    {
      name: 'event-intelligence-hub-store',
      partialize: (state) => ({
        events: state.events,
        guests: state.guests,
        versions: state.versions,
        layoutObjects: state.layoutObjects,
        seatingAssignments: state.seatingAssignments,
        seatingRules: state.seatingRules,
      }),
    }
  )
);
