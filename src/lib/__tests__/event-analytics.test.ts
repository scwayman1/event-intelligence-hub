import { describe, it, expect } from 'vitest';
import { buildEventAnalytics, type EventAnalytics } from '@/lib/event-analytics';
import type {
  AppEvent,
  Guest,
  LayoutObject,
  EventVersion,
  SeatingAssignment,
  SeatingRule,
  RSVPStatus,
} from '@/types/events';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

let _idCounter = 0;
function uid(prefix = 'test') {
  return `${prefix}-${++_idCounter}`;
}

function makeEvent(overrides: Partial<AppEvent> = {}): AppEvent {
  const id = overrides.id ?? uid('evt');
  return {
    id,
    name: 'Test Event',
    type: 'gala',
    status: 'active',
    date: '2026-06-01',
    time: '18:00',
    venue: 'Test Venue',
    venueAddress: '123 Test St',
    estimatedAttendance: 100,
    notes: '',
    activeVersionId: 'ver-default',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeGuest(overrides: Partial<Guest> = {}): Guest {
  const id = overrides.id ?? uid('g');
  return {
    id,
    eventId: 'evt-default',
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

function makeTable(overrides: Partial<LayoutObject> = {}): LayoutObject {
  const id = overrides.id ?? uid('tbl');
  return {
    id,
    versionId: 'ver-default',
    type: 'round_table',
    name: 'Table',
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

function makeLayoutObject(overrides: Partial<LayoutObject> = {}): LayoutObject {
  const id = overrides.id ?? uid('lo');
  return {
    id,
    versionId: 'ver-default',
    type: 'stage',
    name: 'Object',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    capacity: 0,
    notes: '',
    category: 'presentation',
    locked: false,
    visible: true,
    zIndex: 1,
    ...overrides,
  };
}

function makeVersion(overrides: Partial<EventVersion> = {}): EventVersion {
  return {
    id: 'ver-default',
    eventId: 'evt-default',
    name: 'Version 1',
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
    id: overrides.id ?? uid('sa'),
    versionId: 'ver-default',
    guestId: '',
    tableId: '',
    ...overrides,
  };
}

function makeRule(overrides: Partial<SeatingRule> = {}): SeatingRule {
  return {
    id: overrides.id ?? uid('sr'),
    eventId: 'evt-default',
    name: 'Rule',
    description: '',
    enabled: true,
    priority: 1,
    ...overrides,
  };
}

/** Convenience: build analytics with sensible defaults */
function buildAnalytics(overrides: {
  event?: Partial<AppEvent>;
  guests?: Guest[];
  versions?: EventVersion[];
  layoutObjects?: LayoutObject[];
  seatingAssignments?: SeatingAssignment[];
  seatingRules?: SeatingRule[];
} = {}): EventAnalytics {
  const event = makeEvent({ id: 'evt-default', activeVersionId: 'ver-default', ...overrides.event });
  return buildEventAnalytics({
    event,
    guests: overrides.guests ?? [],
    versions: overrides.versions ?? [makeVersion()],
    layoutObjects: overrides.layoutObjects ?? [],
    seatingAssignments: overrides.seatingAssignments ?? [],
    seatingRules: overrides.seatingRules ?? [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildEventAnalytics', () => {
  describe('minimal / empty input', () => {
    it('returns valid analytics with no guests, tables, or rules', () => {
      const result = buildAnalytics();

      expect(result.eventGuests).toHaveLength(0);
      expect(result.confirmedGuests).toHaveLength(0);
      expect(result.tables).toHaveLength(0);
      expect(result.tableSummaries).toHaveLength(0);
      expect(result.totalCapacity).toBe(0);
      expect(result.assignedConfirmed).toBe(0);
      expect(result.unassignedConfirmed).toHaveLength(0);
      expect(result.householdsSplitCount).toBe(0);
      expect(result.frontOfHouseReady).toBe(false);
      expect(result.insights.length).toBeGreaterThan(0);
    });

    it('only includes guests belonging to the event', () => {
      const result = buildAnalytics({
        guests: [
          makeGuest({ eventId: 'evt-default' }),
          makeGuest({ eventId: 'evt-other' }),
        ],
      });
      expect(result.eventGuests).toHaveLength(1);
    });

    it('only includes layout objects for the active version', () => {
      const result = buildAnalytics({
        layoutObjects: [
          makeTable({ versionId: 'ver-default' }),
          makeTable({ versionId: 'ver-other' }),
        ],
      });
      expect(result.layoutObjects).toHaveLength(1);
      expect(result.tables).toHaveLength(1);
    });
  });

  describe('guest filtering by RSVP status', () => {
    const statuses: RSVPStatus[] = ['confirmed', 'declined', 'waitlist', 'invited', 'checked_in'];

    function guestsWithStatuses() {
      return statuses.map((status) =>
        makeGuest({ eventId: 'evt-default', rsvpStatus: status }),
      );
    }

    it('correctly categorises each RSVP status', () => {
      const result = buildAnalytics({ guests: guestsWithStatuses() });

      expect(result.confirmedGuests).toHaveLength(1);
      expect(result.declinedGuests).toHaveLength(1);
      expect(result.waitlistGuests).toHaveLength(1);
      expect(result.invitedGuests).toHaveLength(1);
      expect(result.checkedInGuests).toHaveLength(1);
      expect(result.eventGuests).toHaveLength(5);
    });

    it('handles multiple guests with the same status', () => {
      const guests = [
        makeGuest({ eventId: 'evt-default', rsvpStatus: 'confirmed' }),
        makeGuest({ eventId: 'evt-default', rsvpStatus: 'confirmed' }),
        makeGuest({ eventId: 'evt-default', rsvpStatus: 'confirmed' }),
      ];
      const result = buildAnalytics({ guests });
      expect(result.confirmedGuests).toHaveLength(3);
    });

    it('identifies VIP guests (vip and board_member categories)', () => {
      const guests = [
        makeGuest({ eventId: 'evt-default', category: 'vip' }),
        makeGuest({ eventId: 'evt-default', category: 'board_member' }),
        makeGuest({ eventId: 'evt-default', category: 'donor' }),
      ];
      const result = buildAnalytics({ guests });
      expect(result.vipGuests).toHaveLength(2);
    });

    it('identifies guests with accessibility needs', () => {
      const guests = [
        makeGuest({ eventId: 'evt-default', accessibilityNeeds: 'Wheelchair' }),
        makeGuest({ eventId: 'evt-default', accessibilityNeeds: '' }),
      ];
      const result = buildAnalytics({ guests });
      expect(result.accessibilityGuests).toHaveLength(1);
    });
  });

  describe('table capacity calculations', () => {
    it('sums total capacity across all tables', () => {
      const tables = [
        makeTable({ versionId: 'ver-default', capacity: 8 }),
        makeTable({ versionId: 'ver-default', capacity: 10 }),
        makeTable({ versionId: 'ver-default', capacity: 6 }),
      ];
      const result = buildAnalytics({ layoutObjects: tables });
      expect(result.totalCapacity).toBe(24);
    });

    it('only counts round_table and rect_table as tables', () => {
      const objects = [
        makeTable({ versionId: 'ver-default', type: 'round_table', capacity: 8 }),
        makeTable({ versionId: 'ver-default', type: 'rect_table', capacity: 10 }),
        makeLayoutObject({ versionId: 'ver-default', type: 'stage', capacity: 50 }),
        makeLayoutObject({ versionId: 'ver-default', type: 'checkin', capacity: 0 }),
      ];
      const result = buildAnalytics({ layoutObjects: objects });
      expect(result.tables).toHaveLength(2);
      expect(result.totalCapacity).toBe(18);
    });

    it('computes occupancy rate correctly in table summaries', () => {
      const tableId = 'tbl-1';
      const guestA = makeGuest({ id: 'gA', eventId: 'evt-default', rsvpStatus: 'confirmed' });
      const guestB = makeGuest({ id: 'gB', eventId: 'evt-default', rsvpStatus: 'confirmed' });
      const table = makeTable({ id: tableId, versionId: 'ver-default', capacity: 8 });
      const assignments = [
        makeAssignment({ guestId: 'gA', tableId, versionId: 'ver-default' }),
        makeAssignment({ guestId: 'gB', tableId, versionId: 'ver-default' }),
      ];

      const result = buildAnalytics({
        guests: [guestA, guestB],
        layoutObjects: [table],
        seatingAssignments: assignments,
      });

      const summary = result.tableSummaries[0];
      expect(summary.assigned).toBe(2);
      expect(summary.available).toBe(6);
      expect(summary.occupancyRate).toBe(0.25);
    });

    it('handles a table with zero capacity without dividing by zero', () => {
      const table = makeTable({ id: 'tbl-zero', versionId: 'ver-default', capacity: 0 });
      const result = buildAnalytics({ layoutObjects: [table] });
      const summary = result.tableSummaries[0];
      expect(summary.occupancyRate).toBe(0);
      expect(summary.available).toBe(0);
    });

    it('clamps available seats to zero when over-assigned', () => {
      const tableId = 'tbl-small';
      const guests = Array.from({ length: 3 }, (_, i) =>
        makeGuest({ id: `g-over-${i}`, eventId: 'evt-default' }),
      );
      const table = makeTable({ id: tableId, versionId: 'ver-default', capacity: 2 });
      const assignments = guests.map((g) =>
        makeAssignment({ guestId: g.id, tableId, versionId: 'ver-default' }),
      );

      const result = buildAnalytics({
        guests,
        layoutObjects: [table],
        seatingAssignments: assignments,
      });

      expect(result.tableSummaries[0].available).toBe(0);
      expect(result.tableSummaries[0].assigned).toBe(3);
    });
  });

  describe('zone assignment (front / middle / rear based on y-coordinate)', () => {
    it('assigns front zone to tables in the lowest y third', () => {
      const tables = [
        makeTable({ id: 'front', versionId: 'ver-default', y: 0 }),
        makeTable({ id: 'mid', versionId: 'ver-default', y: 50 }),
        makeTable({ id: 'rear', versionId: 'ver-default', y: 100 }),
      ];
      const result = buildAnalytics({ layoutObjects: tables });

      const zones = Object.fromEntries(
        result.tableSummaries.map((ts) => [ts.tableId, ts.zone]),
      );
      expect(zones['front']).toBe('front');
      expect(zones['mid']).toBe('middle');
      expect(zones['rear']).toBe('rear');
    });

    it('returns front tables correctly', () => {
      const tables = [
        makeTable({ id: 'f1', versionId: 'ver-default', y: 0 }),
        makeTable({ id: 'f2', versionId: 'ver-default', y: 10 }),
        makeTable({ id: 'r1', versionId: 'ver-default', y: 100 }),
      ];
      const result = buildAnalytics({ layoutObjects: tables });
      expect(result.frontTables.length).toBeGreaterThanOrEqual(1);
      expect(result.frontTables.every((t) => t.zone === 'front')).toBe(true);
    });

    it('assigns front zone to a single table at y=0', () => {
      // minY = Math.min(0, 0) = 0, maxY = Math.max(0, 0) = 0, span = 1
      // normalizedY = (0 - 0) / 1 = 0 => front
      const table = makeTable({ id: 'only', versionId: 'ver-default', y: 0 });
      const result = buildAnalytics({ layoutObjects: [table] });
      expect(result.tableSummaries[0].zone).toBe('front');
    });

    it('assigns rear zone to a single table at positive y due to Math.min(..., 0)', () => {
      // minY = Math.min(50, 0) = 0, maxY = Math.max(50, 0) = 50, span = 50
      // normalizedY = (50 - 0) / 50 = 1.0 => rear
      const table = makeTable({ id: 'only-pos', versionId: 'ver-default', y: 50 });
      const result = buildAnalytics({ layoutObjects: [table] });
      expect(result.tableSummaries[0].zone).toBe('rear');
    });

    it('sorts table summaries by y then x', () => {
      const tables = [
        makeTable({ id: 'b', versionId: 'ver-default', y: 100, x: 200 }),
        makeTable({ id: 'a', versionId: 'ver-default', y: 100, x: 100 }),
        makeTable({ id: 'c', versionId: 'ver-default', y: 50, x: 50 }),
      ];
      const result = buildAnalytics({ layoutObjects: tables });
      expect(result.tableSummaries.map((ts) => ts.tableId)).toEqual(['c', 'a', 'b']);
    });
  });

  describe('assigned / unassigned confirmed guests', () => {
    it('tracks unassigned confirmed guests', () => {
      const guests = [
        makeGuest({ id: 'seated', eventId: 'evt-default', rsvpStatus: 'confirmed' }),
        makeGuest({ id: 'unseated', eventId: 'evt-default', rsvpStatus: 'confirmed' }),
      ];
      const table = makeTable({ id: 'tbl-x', versionId: 'ver-default' });
      const assignments = [
        makeAssignment({ guestId: 'seated', tableId: 'tbl-x', versionId: 'ver-default' }),
      ];

      const result = buildAnalytics({
        guests,
        layoutObjects: [table],
        seatingAssignments: assignments,
      });

      expect(result.assignedConfirmed).toBe(1);
      expect(result.unassignedConfirmed).toHaveLength(1);
      expect(result.unassignedConfirmed[0].id).toBe('unseated');
    });

    it('does not count declined or waitlisted guests as unassigned confirmed', () => {
      const guests = [
        makeGuest({ id: 'dec', eventId: 'evt-default', rsvpStatus: 'declined' }),
        makeGuest({ id: 'wait', eventId: 'evt-default', rsvpStatus: 'waitlist' }),
      ];
      const result = buildAnalytics({ guests });
      expect(result.unassignedConfirmed).toHaveLength(0);
    });

    it('tracks all seated guests regardless of RSVP status', () => {
      const guests = [
        makeGuest({ id: 'g1', eventId: 'evt-default', rsvpStatus: 'confirmed' }),
        makeGuest({ id: 'g2', eventId: 'evt-default', rsvpStatus: 'waitlist' }),
      ];
      const table = makeTable({ id: 'tbl-s', versionId: 'ver-default' });
      const assignments = [
        makeAssignment({ guestId: 'g1', tableId: 'tbl-s', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'g2', tableId: 'tbl-s', versionId: 'ver-default' }),
      ];
      const result = buildAnalytics({
        guests,
        layoutObjects: [table],
        seatingAssignments: assignments,
      });
      expect(result.seatedGuests).toHaveLength(2);
    });
  });

  describe('household split detection', () => {
    it('detects households split across multiple tables', () => {
      const guests = [
        makeGuest({ id: 'h1a', eventId: 'evt-default', householdId: 'hh-1' }),
        makeGuest({ id: 'h1b', eventId: 'evt-default', householdId: 'hh-1' }),
      ];
      const tables = [
        makeTable({ id: 'tbl-a', versionId: 'ver-default' }),
        makeTable({ id: 'tbl-b', versionId: 'ver-default' }),
      ];
      const assignments = [
        makeAssignment({ guestId: 'h1a', tableId: 'tbl-a', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'h1b', tableId: 'tbl-b', versionId: 'ver-default' }),
      ];
      const result = buildAnalytics({
        guests,
        layoutObjects: tables,
        seatingAssignments: assignments,
      });
      expect(result.householdsSplitCount).toBe(1);
    });

    it('does not count a household where all members share the same table', () => {
      const guests = [
        makeGuest({ id: 'h2a', eventId: 'evt-default', householdId: 'hh-2' }),
        makeGuest({ id: 'h2b', eventId: 'evt-default', householdId: 'hh-2' }),
      ];
      const table = makeTable({ id: 'tbl-c', versionId: 'ver-default' });
      const assignments = [
        makeAssignment({ guestId: 'h2a', tableId: 'tbl-c', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'h2b', tableId: 'tbl-c', versionId: 'ver-default' }),
      ];
      const result = buildAnalytics({
        guests,
        layoutObjects: [table],
        seatingAssignments: assignments,
      });
      expect(result.householdsSplitCount).toBe(0);
    });

    it('ignores guests without a householdId', () => {
      const guests = [
        makeGuest({ id: 'solo1', eventId: 'evt-default' }),
        makeGuest({ id: 'solo2', eventId: 'evt-default' }),
      ];
      const tables = [
        makeTable({ id: 'tbl-d', versionId: 'ver-default' }),
        makeTable({ id: 'tbl-e', versionId: 'ver-default' }),
      ];
      const assignments = [
        makeAssignment({ guestId: 'solo1', tableId: 'tbl-d', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'solo2', tableId: 'tbl-e', versionId: 'ver-default' }),
      ];
      const result = buildAnalytics({
        guests,
        layoutObjects: tables,
        seatingAssignments: assignments,
      });
      expect(result.householdsSplitCount).toBe(0);
    });

    it('counts multiple split households independently', () => {
      const guests = [
        makeGuest({ id: 'a1', eventId: 'evt-default', householdId: 'hh-a' }),
        makeGuest({ id: 'a2', eventId: 'evt-default', householdId: 'hh-a' }),
        makeGuest({ id: 'b1', eventId: 'evt-default', householdId: 'hh-b' }),
        makeGuest({ id: 'b2', eventId: 'evt-default', householdId: 'hh-b' }),
      ];
      const tables = [
        makeTable({ id: 't1', versionId: 'ver-default' }),
        makeTable({ id: 't2', versionId: 'ver-default' }),
      ];
      const assignments = [
        makeAssignment({ guestId: 'a1', tableId: 't1', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'a2', tableId: 't2', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'b1', tableId: 't1', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'b2', tableId: 't2', versionId: 'ver-default' }),
      ];
      const result = buildAnalytics({
        guests,
        layoutObjects: tables,
        seatingAssignments: assignments,
      });
      expect(result.householdsSplitCount).toBe(2);
    });
  });

  describe('readiness score computation', () => {
    it('returns 0 when nothing is set up (no capacity, no rules, no FOH)', () => {
      // confirmed guests exist but nothing else
      const guests = [makeGuest({ eventId: 'evt-default', rsvpStatus: 'confirmed' })];
      const result = buildAnalytics({ guests });
      // Parts: 0 assigned/1 confirmed = 0, capacity 0 = 0, no rules = 0, no FOH = 0, accessibility factor = 1
      // average = 1/5 = 0.2 => 20
      expect(result.readinessScore).toBe(20);
    });

    it('returns 100 when everything is perfect', () => {
      const tableId = 'tbl-perfect';
      const guestId = 'g-perfect';
      const result = buildAnalytics({
        guests: [makeGuest({ id: guestId, eventId: 'evt-default', rsvpStatus: 'confirmed' })],
        layoutObjects: [
          makeTable({ id: tableId, versionId: 'ver-default', capacity: 1 }),
          makeLayoutObject({ versionId: 'ver-default', type: 'checkin' }),
        ],
        seatingAssignments: [
          makeAssignment({ guestId, tableId, versionId: 'ver-default' }),
        ],
        seatingRules: [
          makeRule({ eventId: 'evt-default', enabled: true }),
        ],
      });
      // assigned/confirmed = 1, capacity ratio = 1, rules = 1, FOH = 1, accessibility = 1
      expect(result.readinessScore).toBe(100);
    });

    it('returns "Event-ready" for score >= 85', () => {
      const tableId = 'tbl-ready';
      const guestId = 'g-ready';
      const result = buildAnalytics({
        guests: [makeGuest({ id: guestId, eventId: 'evt-default', rsvpStatus: 'confirmed' })],
        layoutObjects: [
          makeTable({ id: tableId, versionId: 'ver-default', capacity: 1 }),
          makeLayoutObject({ versionId: 'ver-default', type: 'registration' }),
        ],
        seatingAssignments: [
          makeAssignment({ guestId, tableId, versionId: 'ver-default' }),
        ],
        seatingRules: [
          makeRule({ eventId: 'evt-default', enabled: true }),
        ],
      });
      expect(result.progressLabel).toBe('Event-ready');
    });

    it('returns "Needs work" for score < 65', () => {
      const guests = [makeGuest({ eventId: 'evt-default', rsvpStatus: 'confirmed' })];
      const result = buildAnalytics({ guests });
      expect(result.readinessScore).toBeLessThan(65);
      expect(result.progressLabel).toBe('Needs work');
    });

    it('accounts for disabled rules in the rules factor', () => {
      const result = buildAnalytics({
        seatingRules: [
          makeRule({ eventId: 'evt-default', enabled: true }),
          makeRule({ eventId: 'evt-default', enabled: false }),
        ],
      });
      // rules factor = 1/2 = 0.5; other factors: 1 (no confirmed), 0 (no capacity), 0 (no FOH), 1 (no accessibility)
      // average = (1 + 0 + 0.5 + 0 + 1) / 5 = 0.5 => 50
      expect(result.readinessScore).toBe(50);
    });
  });

  describe('frontOfHouseReady', () => {
    it('is true when a checkin object exists in the active version', () => {
      const result = buildAnalytics({
        layoutObjects: [makeLayoutObject({ versionId: 'ver-default', type: 'checkin' })],
      });
      expect(result.frontOfHouseReady).toBe(true);
    });

    it('is true when a registration object exists', () => {
      const result = buildAnalytics({
        layoutObjects: [makeLayoutObject({ versionId: 'ver-default', type: 'registration' })],
      });
      expect(result.frontOfHouseReady).toBe(true);
    });

    it('is false when only non-FOH objects exist', () => {
      const result = buildAnalytics({
        layoutObjects: [
          makeLayoutObject({ versionId: 'ver-default', type: 'stage' }),
          makeTable({ versionId: 'ver-default' }),
        ],
      });
      expect(result.frontOfHouseReady).toBe(false);
    });
  });

  describe('insights generation', () => {
    it('generates "all confirmed seated" success insight when everyone is assigned', () => {
      const guestId = 'g-all-seated';
      const tableId = 'tbl-insight';
      const result = buildAnalytics({
        guests: [makeGuest({ id: guestId, eventId: 'evt-default', rsvpStatus: 'confirmed' })],
        layoutObjects: [makeTable({ id: tableId, versionId: 'ver-default' })],
        seatingAssignments: [makeAssignment({ guestId, tableId, versionId: 'ver-default' })],
      });
      const insight = result.insights.find((i) => i.id === 'all-confirmed-seated');
      expect(insight).toBeDefined();
      expect(insight!.severity).toBe('success');
    });

    it('generates critical unassigned insight when >= 4 confirmed guests need seats', () => {
      const guests = Array.from({ length: 5 }, (_, i) =>
        makeGuest({ id: `g-ua-${i}`, eventId: 'evt-default', rsvpStatus: 'confirmed' }),
      );
      const result = buildAnalytics({ guests });
      const insight = result.insights.find((i) => i.id === 'unassigned-confirmed');
      expect(insight).toBeDefined();
      expect(insight!.severity).toBe('critical');
      expect(insight!.title).toContain('5');
    });

    it('generates warning unassigned insight when < 4 confirmed guests need seats', () => {
      const guests = Array.from({ length: 2 }, (_, i) =>
        makeGuest({ id: `g-uaw-${i}`, eventId: 'evt-default', rsvpStatus: 'confirmed' }),
      );
      const result = buildAnalytics({ guests });
      const insight = result.insights.find((i) => i.id === 'unassigned-confirmed');
      expect(insight!.severity).toBe('warning');
    });

    it('generates near-capacity insight for tables at >= 90% occupancy', () => {
      const tableId = 'tbl-near';
      const guests = Array.from({ length: 9 }, (_, i) =>
        makeGuest({ id: `g-nc-${i}`, eventId: 'evt-default', rsvpStatus: 'confirmed' }),
      );
      const table = makeTable({ id: tableId, versionId: 'ver-default', capacity: 10 });
      const assignments = guests.map((g) =>
        makeAssignment({ guestId: g.id, tableId, versionId: 'ver-default' }),
      );
      const result = buildAnalytics({
        guests,
        layoutObjects: [table],
        seatingAssignments: assignments,
      });
      const insight = result.insights.find((i) => i.id === 'near-capacity');
      expect(insight).toBeDefined();
      expect(insight!.severity).toBe('warning');
    });

    it('does not generate near-capacity insight when tables are under 90%', () => {
      const tableId = 'tbl-ok';
      const guests = Array.from({ length: 4 }, (_, i) =>
        makeGuest({ id: `g-ok-${i}`, eventId: 'evt-default', rsvpStatus: 'confirmed' }),
      );
      const table = makeTable({ id: tableId, versionId: 'ver-default', capacity: 10 });
      const assignments = guests.map((g) =>
        makeAssignment({ guestId: g.id, tableId, versionId: 'ver-default' }),
      );
      const result = buildAnalytics({
        guests,
        layoutObjects: [table],
        seatingAssignments: assignments,
      });
      expect(result.insights.find((i) => i.id === 'near-capacity')).toBeUndefined();
    });

    it('generates checkin-missing insight when no front-of-house object exists', () => {
      const result = buildAnalytics();
      const insight = result.insights.find((i) => i.id === 'checkin-missing');
      expect(insight).toBeDefined();
      expect(insight!.severity).toBe('critical');
    });

    it('does not generate checkin-missing when checkin object exists', () => {
      const result = buildAnalytics({
        layoutObjects: [makeLayoutObject({ versionId: 'ver-default', type: 'checkin' })],
      });
      expect(result.insights.find((i) => i.id === 'checkin-missing')).toBeUndefined();
    });

    it('generates split-households insight when households are split', () => {
      const guests = [
        makeGuest({ id: 'sh1', eventId: 'evt-default', householdId: 'hh-split' }),
        makeGuest({ id: 'sh2', eventId: 'evt-default', householdId: 'hh-split' }),
      ];
      const tables = [
        makeTable({ id: 'ts1', versionId: 'ver-default' }),
        makeTable({ id: 'ts2', versionId: 'ver-default' }),
      ];
      const assignments = [
        makeAssignment({ guestId: 'sh1', tableId: 'ts1', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'sh2', tableId: 'ts2', versionId: 'ver-default' }),
      ];
      const result = buildAnalytics({ guests, layoutObjects: tables, seatingAssignments: assignments });
      const insight = result.insights.find((i) => i.id === 'split-households');
      expect(insight).toBeDefined();
      expect(insight!.severity).toBe('warning');
    });

    it('generates rsvp-pipeline insight when invited or waitlist guests exist', () => {
      const guests = [
        makeGuest({ eventId: 'evt-default', rsvpStatus: 'invited' }),
        makeGuest({ eventId: 'evt-default', rsvpStatus: 'waitlist' }),
      ];
      const result = buildAnalytics({ guests });
      const insight = result.insights.find((i) => i.id === 'rsvp-pipeline');
      expect(insight).toBeDefined();
      expect(insight!.severity).toBe('info');
      expect(insight!.title).toContain('1 invited');
      expect(insight!.title).toContain('1 waitlist');
    });

    it('does not generate rsvp-pipeline insight with only confirmed guests', () => {
      const guests = [makeGuest({ eventId: 'evt-default', rsvpStatus: 'confirmed' })];
      const result = buildAnalytics({ guests });
      expect(result.insights.find((i) => i.id === 'rsvp-pipeline')).toBeUndefined();
    });
  });

  describe('table summary category mix and accessibility count', () => {
    it('builds category mix from assigned guests', () => {
      const tableId = 'tbl-mix';
      const guests = [
        makeGuest({ id: 'cm1', eventId: 'evt-default', category: 'donor' }),
        makeGuest({ id: 'cm2', eventId: 'evt-default', category: 'donor' }),
        makeGuest({ id: 'cm3', eventId: 'evt-default', category: 'vip' }),
      ];
      const table = makeTable({ id: tableId, versionId: 'ver-default' });
      const assignments = guests.map((g) =>
        makeAssignment({ guestId: g.id, tableId, versionId: 'ver-default' }),
      );
      const result = buildAnalytics({ guests, layoutObjects: [table], seatingAssignments: assignments });
      const summary = result.tableSummaries[0];
      expect(summary.categoryMix).toEqual({ donor: 2, vip: 1 });
    });

    it('counts accessibility needs per table', () => {
      const tableId = 'tbl-acc';
      const guests = [
        makeGuest({ id: 'ac1', eventId: 'evt-default', accessibilityNeeds: 'Wheelchair' }),
        makeGuest({ id: 'ac2', eventId: 'evt-default', accessibilityNeeds: '' }),
        makeGuest({ id: 'ac3', eventId: 'evt-default', accessibilityNeeds: 'Hearing aid' }),
      ];
      const table = makeTable({ id: tableId, versionId: 'ver-default' });
      const assignments = guests.map((g) =>
        makeAssignment({ guestId: g.id, tableId, versionId: 'ver-default' }),
      );
      const result = buildAnalytics({ guests, layoutObjects: [table], seatingAssignments: assignments });
      expect(result.tableSummaries[0].accessibilityCount).toBe(2);
    });
  });

  describe('active version resolution', () => {
    it('uses activeVersionId from the event to match versions', () => {
      const version = makeVersion({ id: 'ver-special', eventId: 'evt-default' });
      const table = makeTable({ versionId: 'ver-special' });
      const result = buildAnalytics({
        event: { activeVersionId: 'ver-special' },
        versions: [version],
        layoutObjects: [table],
      });
      expect(result.activeVersion).toBeDefined();
      expect(result.activeVersion!.id).toBe('ver-special');
      expect(result.tables).toHaveLength(1);
    });

    it('falls back gracefully when no version matches', () => {
      const table = makeTable({ versionId: 'ver-default' });
      const result = buildAnalytics({
        versions: [],
        layoutObjects: [table],
      });
      expect(result.activeVersion).toBeUndefined();
      // Should still pick up objects via fallback to event.activeVersionId
      expect(result.tables).toHaveLength(1);
    });
  });

  describe('donor-scholar pairs', () => {
    it('counts donor-scholar pairs seated at the same table', () => {
      // The hardcoded pairs are: ['g-001','g-006'], ['g-004','g-007'], ['g-003','g-008']
      const guests = [
        makeGuest({ id: 'g-001', eventId: 'evt-default' }),
        makeGuest({ id: 'g-006', eventId: 'evt-default' }),
        makeGuest({ id: 'g-004', eventId: 'evt-default' }),
        makeGuest({ id: 'g-007', eventId: 'evt-default' }),
      ];
      const table = makeTable({ id: 'tbl-pair', versionId: 'ver-default' });
      const assignments = guests.map((g) =>
        makeAssignment({ guestId: g.id, tableId: 'tbl-pair', versionId: 'ver-default' }),
      );
      const result = buildAnalytics({
        guests,
        layoutObjects: [table],
        seatingAssignments: assignments,
      });
      expect(result.donorScholarPairsSeated).toBe(2);
      expect(result.donorScholarPairTargets).toBe(3);
    });

    it('returns 0 when donors and scholars are at different tables', () => {
      const guests = [
        makeGuest({ id: 'g-001', eventId: 'evt-default' }),
        makeGuest({ id: 'g-006', eventId: 'evt-default' }),
      ];
      const tables = [
        makeTable({ id: 'tbl-d1', versionId: 'ver-default' }),
        makeTable({ id: 'tbl-d2', versionId: 'ver-default' }),
      ];
      const assignments = [
        makeAssignment({ guestId: 'g-001', tableId: 'tbl-d1', versionId: 'ver-default' }),
        makeAssignment({ guestId: 'g-006', tableId: 'tbl-d2', versionId: 'ver-default' }),
      ];
      const result = buildAnalytics({
        guests,
        layoutObjects: tables,
        seatingAssignments: assignments,
      });
      expect(result.donorScholarPairsSeated).toBe(0);
    });
  });
});
