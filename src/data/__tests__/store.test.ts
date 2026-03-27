import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from '@/data/store';
import type {
  AppEvent,
  Guest,
  LayoutObject,
  EventVersion,
  SeatingAssignment,
  SeatingRule,
} from '@/types/events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides: Partial<AppEvent> = {}): AppEvent {
  return {
    id: 'evt-test',
    name: 'Test Event',
    type: 'gala',
    status: 'active',
    date: '2026-06-01',
    time: '18:00',
    venue: 'Test Venue',
    venueAddress: '123 Test St',
    estimatedAttendance: 100,
    notes: '',
    activeVersionId: 'ver-test',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  return {
    id: 'g-test',
    eventId: 'evt-test',
    firstName: 'Test',
    lastName: 'Guest',
    displayName: 'Test Guest',
    email: 'test@example.com',
    phone: '',
    organization: '',
    category: 'other',
    rsvpStatus: 'confirmed',
    partySize: 1,
    dietaryRestrictions: '',
    accessibilityNeeds: '',
    notes: '',
    relationshipTags: [],
    tablePreference: '',
    seatingPreference: '',
    ...overrides,
  };
}

function makeLayoutObject(overrides: Partial<LayoutObject> = {}): LayoutObject {
  return {
    id: 'lo-test',
    versionId: 'ver-test',
    type: 'round_table',
    name: 'Table 1',
    x: 0,
    y: 0,
    width: 80,
    height: 80,
    rotation: 0,
    capacity: 8,
    notes: '',
    category: 'seating',
    locked: false,
    visible: true,
    zIndex: 1,
    ...overrides,
  };
}

function makeVersion(overrides: Partial<EventVersion> = {}): EventVersion {
  return {
    id: 'ver-test',
    eventId: 'evt-test',
    name: 'V1',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    createdBy: 'Tester',
    notes: '',
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<SeatingAssignment> = {}): SeatingAssignment {
  return {
    id: 'sa-test',
    versionId: 'ver-test',
    guestId: 'g-test',
    tableId: 'lo-test',
    ...overrides,
  };
}

function makeRule(overrides: Partial<SeatingRule> = {}): SeatingRule {
  return {
    id: 'sr-test',
    eventId: 'evt-test',
    name: 'Rule',
    description: '',
    enabled: true,
    priority: 1,
    ...overrides,
  };
}

/** Reset store to a clean, empty state before each test */
function resetStore() {
  useEventStore.setState({
    events: [],
    guests: [],
    versions: [],
    layoutObjects: [],
    seatingAssignments: [],
    seatingRules: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEventStore', () => {
  beforeEach(() => {
    resetStore();
  });

  // -----------------------------------------------------------------------
  // Event actions
  // -----------------------------------------------------------------------
  describe('addEvent / updateEvent', () => {
    it('adds an event to the store', () => {
      const event = makeEvent({ id: 'evt-1' });
      useEventStore.getState().addEvent(event);
      expect(useEventStore.getState().events).toHaveLength(1);
      expect(useEventStore.getState().events[0].id).toBe('evt-1');
    });

    it('adds multiple events', () => {
      useEventStore.getState().addEvent(makeEvent({ id: 'evt-a' }));
      useEventStore.getState().addEvent(makeEvent({ id: 'evt-b' }));
      expect(useEventStore.getState().events).toHaveLength(2);
    });

    it('updates an existing event by id', () => {
      useEventStore.getState().addEvent(makeEvent({ id: 'evt-1', name: 'Original' }));
      useEventStore.getState().updateEvent('evt-1', { name: 'Updated' });
      expect(useEventStore.getState().events[0].name).toBe('Updated');
    });

    it('does not modify other events during update', () => {
      useEventStore.getState().addEvent(makeEvent({ id: 'evt-1', name: 'First' }));
      useEventStore.getState().addEvent(makeEvent({ id: 'evt-2', name: 'Second' }));
      useEventStore.getState().updateEvent('evt-1', { name: 'Changed' });
      expect(useEventStore.getState().events.find((e) => e.id === 'evt-2')!.name).toBe('Second');
    });

    it('does nothing when updating a non-existent event', () => {
      useEventStore.getState().addEvent(makeEvent({ id: 'evt-1' }));
      useEventStore.getState().updateEvent('evt-nonexistent', { name: 'Nope' });
      expect(useEventStore.getState().events).toHaveLength(1);
      expect(useEventStore.getState().events[0].name).toBe('Test Event');
    });
  });

  // -----------------------------------------------------------------------
  // Guest actions
  // -----------------------------------------------------------------------
  describe('addGuest / updateGuest / removeGuest', () => {
    it('adds a guest to the store', () => {
      const guest = makeGuest({ id: 'g-1' });
      useEventStore.getState().addGuest(guest);
      expect(useEventStore.getState().guests).toHaveLength(1);
      expect(useEventStore.getState().guests[0].id).toBe('g-1');
    });

    it('updates a guest by id', () => {
      useEventStore.getState().addGuest(makeGuest({ id: 'g-1', firstName: 'Alice' }));
      useEventStore.getState().updateGuest('g-1', { firstName: 'Bob' });
      expect(useEventStore.getState().guests[0].firstName).toBe('Bob');
    });

    it('preserves untouched fields on update', () => {
      useEventStore.getState().addGuest(makeGuest({ id: 'g-1', firstName: 'Alice', lastName: 'Smith' }));
      useEventStore.getState().updateGuest('g-1', { firstName: 'Bob' });
      expect(useEventStore.getState().guests[0].lastName).toBe('Smith');
    });

    it('removes a guest by id', () => {
      useEventStore.getState().addGuest(makeGuest({ id: 'g-1' }));
      useEventStore.getState().addGuest(makeGuest({ id: 'g-2' }));
      useEventStore.getState().removeGuest('g-1');
      expect(useEventStore.getState().guests).toHaveLength(1);
      expect(useEventStore.getState().guests[0].id).toBe('g-2');
    });

    it('does nothing when removing a non-existent guest', () => {
      useEventStore.getState().addGuest(makeGuest({ id: 'g-1' }));
      useEventStore.getState().removeGuest('g-nonexistent');
      expect(useEventStore.getState().guests).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Layout object actions
  // -----------------------------------------------------------------------
  describe('addLayoutObject / updateLayoutObject / removeLayoutObject', () => {
    it('adds a layout object', () => {
      const obj = makeLayoutObject({ id: 'lo-1' });
      useEventStore.getState().addLayoutObject(obj);
      expect(useEventStore.getState().layoutObjects).toHaveLength(1);
    });

    it('updates a layout object by id', () => {
      useEventStore.getState().addLayoutObject(makeLayoutObject({ id: 'lo-1', x: 10 }));
      useEventStore.getState().updateLayoutObject('lo-1', { x: 99 });
      expect(useEventStore.getState().layoutObjects[0].x).toBe(99);
    });

    it('preserves other fields on update', () => {
      useEventStore.getState().addLayoutObject(makeLayoutObject({ id: 'lo-1', x: 10, y: 20 }));
      useEventStore.getState().updateLayoutObject('lo-1', { x: 50 });
      expect(useEventStore.getState().layoutObjects[0].y).toBe(20);
    });

    it('removes a layout object by id', () => {
      useEventStore.getState().addLayoutObject(makeLayoutObject({ id: 'lo-1' }));
      useEventStore.getState().addLayoutObject(makeLayoutObject({ id: 'lo-2' }));
      useEventStore.getState().removeLayoutObject('lo-1');
      expect(useEventStore.getState().layoutObjects).toHaveLength(1);
      expect(useEventStore.getState().layoutObjects[0].id).toBe('lo-2');
    });

    it('does nothing when removing a non-existent layout object', () => {
      useEventStore.getState().addLayoutObject(makeLayoutObject({ id: 'lo-1' }));
      useEventStore.getState().removeLayoutObject('lo-nope');
      expect(useEventStore.getState().layoutObjects).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Version actions
  // -----------------------------------------------------------------------
  describe('addVersion / updateVersion', () => {
    it('adds a version', () => {
      useEventStore.getState().addVersion(makeVersion({ id: 'ver-1' }));
      expect(useEventStore.getState().versions).toHaveLength(1);
    });

    it('updates a version by id', () => {
      useEventStore.getState().addVersion(makeVersion({ id: 'ver-1', name: 'Draft' }));
      useEventStore.getState().updateVersion('ver-1', { name: 'Final' });
      expect(useEventStore.getState().versions[0].name).toBe('Final');
    });
  });

  // -----------------------------------------------------------------------
  // Seating assignment actions
  // -----------------------------------------------------------------------
  describe('addSeatingAssignment / removeSeatingAssignment', () => {
    it('adds a seating assignment', () => {
      useEventStore.getState().addSeatingAssignment(makeAssignment({ id: 'sa-1' }));
      expect(useEventStore.getState().seatingAssignments).toHaveLength(1);
    });

    it('removes a seating assignment by id', () => {
      useEventStore.getState().addSeatingAssignment(makeAssignment({ id: 'sa-1' }));
      useEventStore.getState().addSeatingAssignment(makeAssignment({ id: 'sa-2' }));
      useEventStore.getState().removeSeatingAssignment('sa-1');
      expect(useEventStore.getState().seatingAssignments).toHaveLength(1);
      expect(useEventStore.getState().seatingAssignments[0].id).toBe('sa-2');
    });
  });

  // -----------------------------------------------------------------------
  // moveGuestToTable
  // -----------------------------------------------------------------------
  describe('moveGuestToTable', () => {
    it('creates a new assignment for a guest not yet assigned', () => {
      useEventStore.getState().moveGuestToTable('g-1', 'lo-1', 'ver-1');
      const assignments = useEventStore.getState().seatingAssignments;
      expect(assignments).toHaveLength(1);
      expect(assignments[0].guestId).toBe('g-1');
      expect(assignments[0].tableId).toBe('lo-1');
      expect(assignments[0].versionId).toBe('ver-1');
    });

    it('removes old assignment and creates new one when guest already has one in the same version', () => {
      useEventStore.setState({
        seatingAssignments: [makeAssignment({ id: 'sa-old', guestId: 'g-1', tableId: 'lo-1', versionId: 'ver-1' })],
      });

      useEventStore.getState().moveGuestToTable('g-1', 'lo-2', 'ver-1');
      const assignments = useEventStore.getState().seatingAssignments;
      expect(assignments).toHaveLength(1);
      expect(assignments[0].tableId).toBe('lo-2');
      expect(assignments[0].id).not.toBe('sa-old');
    });

    it('does not remove assignments for the same guest in other versions', () => {
      useEventStore.setState({
        seatingAssignments: [
          makeAssignment({ id: 'sa-v1', guestId: 'g-1', tableId: 'lo-1', versionId: 'ver-1' }),
          makeAssignment({ id: 'sa-v2', guestId: 'g-1', tableId: 'lo-1', versionId: 'ver-2' }),
        ],
      });

      useEventStore.getState().moveGuestToTable('g-1', 'lo-3', 'ver-1');
      const assignments = useEventStore.getState().seatingAssignments;
      expect(assignments).toHaveLength(2);
      expect(assignments.find((a) => a.versionId === 'ver-2')!.tableId).toBe('lo-1');
      expect(assignments.find((a) => a.versionId === 'ver-1')!.tableId).toBe('lo-3');
    });

    it('does not remove assignments for other guests at the same table', () => {
      useEventStore.setState({
        seatingAssignments: [
          makeAssignment({ id: 'sa-other', guestId: 'g-other', tableId: 'lo-1', versionId: 'ver-1' }),
        ],
      });
      useEventStore.getState().moveGuestToTable('g-1', 'lo-1', 'ver-1');
      const assignments = useEventStore.getState().seatingAssignments;
      expect(assignments).toHaveLength(2);
    });

    it('generates a unique id for the new assignment', () => {
      useEventStore.getState().moveGuestToTable('g-1', 'lo-1', 'ver-1');
      useEventStore.getState().moveGuestToTable('g-2', 'lo-1', 'ver-1');
      const [a1, a2] = useEventStore.getState().seatingAssignments;
      expect(a1.id).not.toBe(a2.id);
    });
  });

  // -----------------------------------------------------------------------
  // Selector functions
  // -----------------------------------------------------------------------
  describe('getEventGuests', () => {
    it('returns only guests for the specified event', () => {
      useEventStore.setState({
        guests: [
          makeGuest({ id: 'g-1', eventId: 'evt-1' }),
          makeGuest({ id: 'g-2', eventId: 'evt-1' }),
          makeGuest({ id: 'g-3', eventId: 'evt-2' }),
        ],
      });
      const result = useEventStore.getState().getEventGuests('evt-1');
      expect(result).toHaveLength(2);
      expect(result.every((g) => g.eventId === 'evt-1')).toBe(true);
    });

    it('returns empty array for an event with no guests', () => {
      expect(useEventStore.getState().getEventGuests('evt-none')).toEqual([]);
    });
  });

  describe('getEventVersions', () => {
    it('returns versions for the specified event', () => {
      useEventStore.setState({
        versions: [
          makeVersion({ id: 'ver-1', eventId: 'evt-1' }),
          makeVersion({ id: 'ver-2', eventId: 'evt-2' }),
        ],
      });
      const result = useEventStore.getState().getEventVersions('evt-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ver-1');
    });
  });

  describe('getVersionObjects', () => {
    it('returns layout objects for the specified version', () => {
      useEventStore.setState({
        layoutObjects: [
          makeLayoutObject({ id: 'lo-1', versionId: 'ver-1' }),
          makeLayoutObject({ id: 'lo-2', versionId: 'ver-2' }),
          makeLayoutObject({ id: 'lo-3', versionId: 'ver-1' }),
        ],
      });
      const result = useEventStore.getState().getVersionObjects('ver-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('getVersionSeating', () => {
    it('returns seating assignments for the specified version', () => {
      useEventStore.setState({
        seatingAssignments: [
          makeAssignment({ id: 'sa-1', versionId: 'ver-1' }),
          makeAssignment({ id: 'sa-2', versionId: 'ver-2' }),
        ],
      });
      const result = useEventStore.getState().getVersionSeating('ver-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sa-1');
    });
  });

  describe('getEventRules', () => {
    it('returns rules for the specified event', () => {
      useEventStore.setState({
        seatingRules: [
          makeRule({ id: 'sr-1', eventId: 'evt-1' }),
          makeRule({ id: 'sr-2', eventId: 'evt-2' }),
        ],
      });
      const result = useEventStore.getState().getEventRules('evt-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sr-1');
    });
  });

  describe('getTableGuests', () => {
    it('returns guests assigned to a specific table in a specific version', () => {
      useEventStore.setState({
        guests: [
          makeGuest({ id: 'g-1', eventId: 'evt-1' }),
          makeGuest({ id: 'g-2', eventId: 'evt-1' }),
          makeGuest({ id: 'g-3', eventId: 'evt-1' }),
        ],
        seatingAssignments: [
          makeAssignment({ id: 'sa-1', guestId: 'g-1', tableId: 'lo-1', versionId: 'ver-1' }),
          makeAssignment({ id: 'sa-2', guestId: 'g-2', tableId: 'lo-1', versionId: 'ver-1' }),
          makeAssignment({ id: 'sa-3', guestId: 'g-3', tableId: 'lo-2', versionId: 'ver-1' }),
        ],
      });
      const result = useEventStore.getState().getTableGuests('lo-1', 'ver-1');
      expect(result).toHaveLength(2);
      expect(result.map((g) => g.id).sort()).toEqual(['g-1', 'g-2']);
    });

    it('does not return guests from another version', () => {
      useEventStore.setState({
        guests: [makeGuest({ id: 'g-1' })],
        seatingAssignments: [
          makeAssignment({ id: 'sa-1', guestId: 'g-1', tableId: 'lo-1', versionId: 'ver-other' }),
        ],
      });
      const result = useEventStore.getState().getTableGuests('lo-1', 'ver-1');
      expect(result).toHaveLength(0);
    });

    it('returns empty array for a table with no assignments', () => {
      expect(useEventStore.getState().getTableGuests('lo-empty', 'ver-1')).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases / integration-style
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles add then remove then re-add of the same guest id', () => {
      const guest = makeGuest({ id: 'g-cycle' });
      const { addGuest, removeGuest } = useEventStore.getState();
      addGuest(guest);
      removeGuest('g-cycle');
      expect(useEventStore.getState().guests).toHaveLength(0);
      useEventStore.getState().addGuest({ ...guest, firstName: 'Returned' });
      expect(useEventStore.getState().guests).toHaveLength(1);
      expect(useEventStore.getState().guests[0].firstName).toBe('Returned');
    });

    it('moveGuestToTable works correctly when store has many assignments', () => {
      const assignments = Array.from({ length: 20 }, (_, i) =>
        makeAssignment({ id: `sa-${i}`, guestId: `g-${i}`, tableId: 'lo-1', versionId: 'ver-1' }),
      );
      useEventStore.setState({ seatingAssignments: assignments });

      useEventStore.getState().moveGuestToTable('g-5', 'lo-2', 'ver-1');

      const state = useEventStore.getState().seatingAssignments;
      // 19 original (minus g-5) + 1 new = 20
      expect(state).toHaveLength(20);
      const movedGuest = state.find((a) => a.guestId === 'g-5');
      expect(movedGuest).toBeDefined();
      expect(movedGuest!.tableId).toBe('lo-2');
    });
  });
});
