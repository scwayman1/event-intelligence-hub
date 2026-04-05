/**
 * Franck Eggelhoffer AI Agent — Tool Execution Layer
 *
 * Maps tool names to implementations that read from the Zustand store state
 * and delegate to the existing pure-function service libraries. Every tool
 * returns a JSON string suitable for inclusion in an LLM conversation.
 */

import { useEventStore } from '@/data/store';
import type { GuestMessage, DeliveryResult } from '@/types/messaging';

import {
  computeEventHealth,
  analyzeGuests,
  analyzeSeating,
  generateInsights,
  getDefaultCommTemplates,
  renderTemplate,
} from '@/services/orchestrator';

import {
  getGuestSegments,
  computeAttendanceProjection,
  analyzeDietaryNeeds,
  getGuestConnectionMap,
} from '@/services/guest-intelligence';

import {
  generateSeatingProposal,
  scoreExistingSeating,
  getSeatingRecommendations,
} from '@/services/smart-seating';

import {
  runRefinementLoop,
  formatRefinementSummary,
} from '@/services/franck-autopilot';

import {
  arrangeGrid,
  arrangeCircle,
  arrangeRows,
  distributeEqual,
  alignObjects,
  type ArrangeableObject,
} from '@/lib/arrangement-engine';

import type { Guest, GuestCategory, RSVPStatus, AppEvent, EventVersion, LayoutObject, RelationshipGroup, RelationshipMembership, RelationshipType } from '@/types/events';

// ---------------------------------------------------------------------------
// Store state snapshot type
// ---------------------------------------------------------------------------

type StoreState = ReturnType<typeof useEventStore.getState>;

// ---------------------------------------------------------------------------
// Tool input types
// ---------------------------------------------------------------------------

interface ToolInput {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function errorResult(message: string): string {
  return json({ error: true, message });
}

function eventNotFoundError(eventId: string): string {
  return errorResult(
    `Event '${eventId}' not found. Make sure you're in an active event.`,
  );
}

/** Validate that required string parameters are present and non-empty. */
function validateRequired(
  input: ToolInput,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const val = input[key];
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
      return `Parameter '${key}' is required but was not provided.`;
    }
  }
  return null;
}

/** Validate that a value is a finite number. Returns an error string or null. */
/** Coerce a value to a number if it's a numeric string, otherwise return as-is. */
function coerceNumber(value: unknown): unknown {
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

function validateNumber(
  value: unknown,
  paramName: string,
): string | null {
  if (value === undefined || value === null) return null; // optional
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return `Parameter '${paramName}' must be a valid number, but received: ${JSON.stringify(value)}`;
  }
  return null;
}

const VALID_CATEGORIES: GuestCategory[] = ['donor', 'scholarship_recipient', 'family', 'board_member', 'vip', 'staff', 'sponsor', 'volunteer', 'dignitary', 'other'];

const CATEGORY_ALIASES: Record<string, GuestCategory> = {
  donor: 'donor', donors: 'donor',
  scholar: 'scholarship_recipient', scholarship: 'scholarship_recipient',
  scholarship_recipient: 'scholarship_recipient', recipient: 'scholarship_recipient',
  student: 'scholarship_recipient',
  family: 'family',
  board: 'board_member', board_member: 'board_member',
  vip: 'vip',
  staff: 'staff',
  sponsor: 'sponsor',
  volunteer: 'volunteer',
  dignitary: 'dignitary',
  other: 'other',
};

const VALID_RSVP: RSVPStatus[] = ['invited', 'confirmed', 'declined', 'waitlist', 'checked_in'];

const RSVP_ALIASES: Record<string, RSVPStatus> = {
  invited: 'invited', pending: 'invited',
  confirmed: 'confirmed', yes: 'confirmed', accepted: 'confirmed',
  declined: 'declined', no: 'declined',
  waitlist: 'waitlist', waitlisted: 'waitlist',
  checked_in: 'checked_in', checkedin: 'checked_in',
};

/** Normalize a category string from LLM input to a valid GuestCategory. */
function normalizeCategory(raw: unknown): GuestCategory {
  if (typeof raw !== 'string' || !raw.trim()) return 'other';
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  return CATEGORY_ALIASES[key] ?? (VALID_CATEGORIES.includes(key as GuestCategory) ? key as GuestCategory : 'other');
}

/** Normalize an RSVP status string from LLM input to a valid RSVPStatus. */
function normalizeRsvp(raw: unknown): RSVPStatus {
  if (typeof raw !== 'string' || !raw.trim()) return 'invited';
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  return RSVP_ALIASES[key] ?? (VALID_RSVP.includes(key as RSVPStatus) ? key as RSVPStatus : 'invited');
}

/** Build a comma-separated list of valid table numbers from context tables. */
function validTableNumbers(tables: Array<{ tableNumber?: number | null; name: string }>): string {
  if (tables.length === 0) return '(no tables exist)';
  return tables
    .map((t) => t.tableNumber != null ? `${t.tableNumber} (${t.name})` : t.name)
    .join(', ');
}

/** Look up the event and its associated data from the store snapshot. */
function getEventContext(state: StoreState, eventId: string) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return null;

  const guests = state.guests.filter((g) => g.eventId === eventId);
  const versions = state.versions.filter((v) => v.eventId === eventId);
  const activeVersion = versions.find((v) => v.id === event.activeVersionId);
  const versionId = activeVersion?.id ?? event.activeVersionId;
  const allObjects = state.layoutObjects.filter((o) => o.versionId === versionId);
  const tables = allObjects.filter(
    (o) => o.type === 'round_table' || o.type === 'rect_table',
  );
  const assignments = state.seatingAssignments.filter(
    (a) => a.versionId === versionId,
  );
  const groups = state.relationshipGroups.filter(
    (g) => g.eventId === eventId,
  );
  const memberships = state.relationshipMemberships.filter((m) =>
    groups.some((g) => g.id === m.groupId),
  );

  return {
    event,
    guests,
    versions,
    activeVersion,
    versionId,
    allObjects,
    tables,
    assignments,
    groups,
    memberships,
  };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function getEventSummary(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const { event, guests, tables, assignments, versions } = ctx;
  const health = computeEventHealth(event, guests, tables, assignments, versions);
  const guestAnalytics = analyzeGuests(guests, eventId);

  const confirmedCount = guestAnalytics.byStatus.confirmed + guestAnalytics.byStatus.checked_in;

  return json({
    summary: `${event.name}: ${guestAnalytics.total} guests, ${confirmedCount} confirmed, health ${health.overall}/100`,
    eventId: event.id,
    name: event.name,
    type: event.type,
    status: event.status,
    date: event.date,
    time: event.time,
    venue: event.venue,
    venueAddress: event.venueAddress,
    guestCount: guestAnalytics.total,
    confirmedCount,
    declinedCount: guestAnalytics.byStatus.declined,
    pendingCount:
      guestAnalytics.byStatus.invited + guestAnalytics.byStatus.waitlist,
    confirmationRate: guestAnalytics.confirmationRate,
    totalExpectedAttendance: guestAnalytics.totalExpectedAttendance,
    healthScore: health,
  });
}

function analyzeGuestList(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  let filteredGuests = ctx.guests;

  // Optional filters
  const category = input.category as GuestCategory | undefined;
  const rsvpStatus = input.rsvpStatus as RSVPStatus | undefined;

  if (category) {
    filteredGuests = filteredGuests.filter((g) => g.category === category);
  }
  if (rsvpStatus) {
    filteredGuests = filteredGuests.filter((g) => g.rsvpStatus === rsvpStatus);
  }

  // analyzeGuests works on the full guest list (it filters by eventId internally),
  // so we always pass the unfiltered list for accurate analytics.
  const analytics = analyzeGuests(ctx.guests, eventId);
  const segments = getGuestSegments(filteredGuests);

  const filterDesc = [category && `category=${category}`, rsvpStatus && `rsvp=${rsvpStatus}`].filter(Boolean).join(', ') || 'none';

  return json({
    summary: `${filteredGuests.length} guests matched (filters: ${filterDesc}). ${analytics.confirmationRate}% confirmation rate.`,
    totalFiltered: filteredGuests.length,
    filters: {
      category: category ?? null,
      rsvpStatus: rsvpStatus ?? null,
    },
    analytics: {
      total: analytics.total,
      byStatus: analytics.byStatus,
      byCategory: analytics.byCategory,
      confirmationRate: analytics.confirmationRate,
      plusOneCount: analytics.plusOneCount,
      totalExpectedAttendance: analytics.totalExpectedAttendance,
      dietarySummary: analytics.dietarySummary,
      pendingHighPriorityCount: analytics.pendingHighPriority.length,
      needsFollowUpCount: analytics.needsFollowUp.length,
      accessibilityNeedsCount: analytics.accessibilityNeeds.length,
    },
    rsvpDetails: {
      partySizeByStatus: Object.fromEntries(
        (['invited', 'confirmed', 'declined', 'waitlist', 'checked_in'] as const).map((status) => [
          status,
          ctx.guests.filter((g) => g.rsvpStatus === status).reduce((sum, g) => sum + (g.partySize || 1), 0),
        ]),
      ),
      highPriorityNonResponders: ctx.guests
        .filter(
          (g) =>
            (['donor', 'vip', 'board_member', 'sponsor'] as GuestCategory[]).includes(
              g.category,
            ) && g.rsvpStatus === 'invited',
        )
        .map((g) => ({
          displayName: g.displayName,
          email: g.email,
          category: g.category,
          partySize: g.partySize,
        })),
      responseRate:
        ctx.guests.length > 0
          ? Math.round(
              (ctx.guests.filter((g) => g.rsvpStatus !== 'invited').length /
                ctx.guests.length) *
                100,
            )
          : 0,
    },
    segments: segments.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      guestCount: s.guests.length,
      suggestedAction: s.suggestedAction,
    })),
  });
}

function searchGuests(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'query');
  if (reqErr) return errorResult(reqErr);

  const query = (input.query as string).trim();
  if (!query) {
    return errorResult("Parameter 'query' is required but was not provided.");
  }

  const needle = query.toLowerCase();

  const matches = ctx.guests.filter((g) => {
    const haystack = [
      g.firstName,
      g.lastName,
      g.displayName,
      g.email,
      g.organization,
      g.category,
      g.notes,
      g.dietaryRestrictions,
      g.accessibilityNeeds,
      g.tablePreference,
      g.seatingPreference,
      ...(g.relationshipTags ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });

  if (matches.length === 0) {
    return json({
      summary: `Found 0 guests matching '${query}'. Check the spelling or try a partial name.`,
      query,
      resultCount: 0,
      results: [],
    });
  }

  return json({
    summary: `Found ${matches.length} guest${matches.length === 1 ? '' : 's'} matching '${query}'`,
    query,
    resultCount: matches.length,
    results: matches.map((g) => {
      const assignment = ctx.assignments.find((a) => a.guestId === g.id);
      const table = assignment ? ctx.tables.find((t) => t.id === assignment.tableId) : null;
      return {
        id: g.id,
        displayName: g.displayName,
        email: g.email,
        organization: g.organization,
        category: g.category,
        rsvpStatus: g.rsvpStatus,
        partySize: g.partySize,
        relationshipTags: g.relationshipTags ?? [],
        tablePreference: g.tablePreference || null,
        seatingPreference: g.seatingPreference || null,
        seating: table
          ? { tableId: table.id, tableNumber: table.tableNumber ?? null, tableName: table.name }
          : null,
      };
    }),
  });
}

function listGuests(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  let filtered = ctx.guests;

  // Optional filters — case-insensitive to handle mismatched data
  const category = input.category ? normalizeCategory(input.category) : undefined;
  const rsvpStatus = input.rsvpStatus ? normalizeRsvp(input.rsvpStatus) : undefined;
  const tag = input.tag as string | undefined;
  const seated = input.seated as boolean | undefined;

  if (category) filtered = filtered.filter((g) => g.category.toLowerCase().replace(/\s+/g, '_') === category);
  if (rsvpStatus) filtered = filtered.filter((g) => g.rsvpStatus.toLowerCase().replace(/\s+/g, '_') === rsvpStatus);
  if (tag) {
    const needle = tag.toLowerCase();
    filtered = filtered.filter((g) =>
      (g.relationshipTags ?? []).some((t) => t.toLowerCase().includes(needle)),
    );
  }
  if (seated === true) {
    const seatedIds = new Set(ctx.assignments.map((a) => a.guestId));
    filtered = filtered.filter((g) => seatedIds.has(g.id));
  } else if (seated === false) {
    const seatedIds = new Set(ctx.assignments.map((a) => a.guestId));
    filtered = filtered.filter((g) => !seatedIds.has(g.id));
  }

  // Pagination
  const offset = typeof input.offset === 'number' ? input.offset : 0;
  const limit = typeof input.limit === 'number' ? input.limit : 50;
  const page = filtered.slice(offset, offset + limit);

  return json({
    summary: `${filtered.length} guests${category ? ` (${category})` : ''}${tag ? ` with tag "${tag}"` : ''}${seated === true ? ' (seated)' : seated === false ? ' (unseated)' : ''} — showing ${offset + 1}-${Math.min(offset + limit, filtered.length)} of ${filtered.length}`,
    total: filtered.length,
    offset,
    limit,
    hasMore: offset + limit < filtered.length,
    guests: page.map((g) => {
      const assignment = ctx.assignments.find((a) => a.guestId === g.id);
      const table = assignment ? ctx.tables.find((t) => t.id === assignment.tableId) : null;
      return {
        id: g.id,
        displayName: g.displayName,
        category: g.category,
        rsvpStatus: g.rsvpStatus,
        organization: g.organization,
        relationshipTags: g.relationshipTags ?? [],
        tablePreference: g.tablePreference || null,
        seatingPreference: g.seatingPreference || null,
        dietaryRestrictions: g.dietaryRestrictions || null,
        accessibilityNeeds: g.accessibilityNeeds || null,
        seated: table
          ? { tableNumber: table.tableNumber ?? null, tableName: table.name }
          : null,
      };
    }),
  });
}

function getGuestDetails(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'guestId');
  if (reqErr) return errorResult(reqErr);
  const guestId = input.guestId as string;

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) {
    return errorResult(`Guest "${guestId}" not found in event "${eventId}".`);
  }

  // Get relationship connections
  const connectionMap = getGuestConnectionMap(
    ctx.guests,
    ctx.groups,
    ctx.memberships,
  );
  const connections = connectionMap.find((c) => c.guestId === guestId);

  // Get seating assignment
  const assignment = ctx.assignments.find((a) => a.guestId === guestId);
  let tableName: string | undefined;
  if (assignment) {
    const table = ctx.tables.find((t) => t.id === assignment.tableId);
    tableName = table?.name;
  }

  const seatInfo = assignment ? `, seated at ${tableName ?? 'a table'}` : ', not yet seated';
  return json({
    summary: `${guest.displayName} (${guest.rsvpStatus}, ${guest.category}${seatInfo})`,
    guest: {
      id: guest.id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      displayName: guest.displayName,
      email: guest.email,
      phone: guest.phone,
      organization: guest.organization,
      category: guest.category,
      rsvpStatus: guest.rsvpStatus,
      partySize: guest.partySize,
      dietaryRestrictions: guest.dietaryRestrictions,
      accessibilityNeeds: guest.accessibilityNeeds,
      notes: guest.notes,
      tablePreference: guest.tablePreference,
      seatingPreference: guest.seatingPreference,
      relationshipTags: guest.relationshipTags,
      plusOneId: guest.plusOneId ?? null,
      householdId: guest.householdId ?? null,
    },
    seating: assignment
      ? {
          tableId: assignment.tableId,
          tableNumber: ctx.tables.find((t) => t.id === assignment.tableId)?.tableNumber ?? null,
          tableName: tableName ?? 'Unknown',
          seatNumber: assignment.seatNumber ?? null,
        }
      : null,
    connections: connections
      ? {
          totalConnections: connections.totalConnections,
          isAnchor: connections.isAnchor,
          connections: connections.connections,
        }
      : { totalConnections: 0, isAnchor: false, connections: [] },
  });
}

function autoSeatGuests(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.tables.length === 0) {
    return errorResult(
      'No tables exist in the active layout version. Use the add_table tool to create tables first (e.g. add_table with capacity 8).',
    );
  }

  // If all guests are already seated, auto-clear and re-seat from scratch.
  // This handles the common case where the user says "seat everyone" when
  // everyone is already seated — they want a fresh arrangement.
  const assignedGuestIds = new Set(ctx.assignments.map((a) => a.guestId));
  const unseatedEligible = ctx.guests.filter(
    (g) => g.rsvpStatus !== 'declined' && !assignedGuestIds.has(g.id),
  );

  if (unseatedEligible.length === 0 && ctx.guests.length > 0 && ctx.assignments.length > 0) {
    const store = useEventStore.getState();
    for (const a of ctx.assignments) {
      store.removeSeatingAssignment(a.id);
    }
    // Refresh context after clearing
    ctx.assignments = [];
  }

  // Pass strategy hints from the LLM if provided
  const disperseCategories = Array.isArray(input.disperseCategories)
    ? input.disperseCategories as string[]
    : undefined;
  const strategy = typeof input.strategy === 'string' ? input.strategy : undefined;

  const proposal = generateSeatingProposal({
    tables: ctx.tables,
    guests: ctx.guests,
    existingAssignments: ctx.assignments,
    relationshipGroups: ctx.groups,
    relationshipMemberships: ctx.memberships,
    versionId: ctx.versionId,
    disperseCategories,
    strategy,
  });

  // If proposal generated 0 assignments, include diagnostic info
  if (proposal.assignments.length === 0) {
    return json({
      applied: 0,
      totalProposed: 0,
      diagnostics: {
        tablesFound: ctx.tables.length,
        guestsInEvent: ctx.guests.length,
        versionId: ctx.versionId,
        algorithmLog: proposal.log.slice(-10),
      },
      summary: `Seating algorithm produced 0 assignments. ${ctx.tables.length} tables, ${ctx.guests.length} guests. Check algorithm log for details.`,
      instruction: 'The auto-seating algorithm returned 0 assignments. Report this to the user and show the diagnostic details. Do NOT make up a plan — ask the user to check their layout has tables in the active version.',
    });
  }

  // Apply the assignments to the store
  const store = useEventStore.getState();
  let applied = 0;
  const applyErrors: string[] = [];
  for (const assignment of proposal.assignments) {
    try {
      if (assignment.seatNumber != null) {
        store.assignGuestToSeat(
          assignment.guestId,
          assignment.tableId,
          assignment.seatNumber,
          ctx.versionId,
        );
      } else {
        store.moveGuestToTable(
          assignment.guestId,
          assignment.tableId,
          ctx.versionId,
        );
      }
      applied++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      applyErrors.push(`${assignment.guestId}: ${msg}`);
      console.warn(`[auto_seat_guests] Failed to seat guest ${assignment.guestId} at table ${assignment.tableId}:`, err);
    }
  }

  return json({
    applied,
    totalProposed: proposal.assignments.length,
    applyErrors: applyErrors.length > 0 ? applyErrors.slice(0, 10) : undefined,
    assignments: proposal.assignments.slice(0, 30).map((a) => {
      const guest = ctx.guests.find((g) => g.id === a.guestId);
      const table = ctx.tables.find((t) => t.id === a.tableId);
      return {
        guestId: a.guestId,
        guestName: guest?.displayName ?? 'Unknown',
        tableId: a.tableId,
        tableNumber: table?.tableNumber ?? null,
        tableName: table?.name ?? 'Unknown',
        seatNumber: a.seatNumber,
        reason: a.reason,
      };
    }),
    score: proposal.score,
    proposalSummary: proposal.summary,
    algorithmLog: proposal.log.slice(-5),
    summary: `Seated ${applied} guest${applied === 1 ? '' : 's'} across ${proposal.summary.tablesUsed} table${proposal.summary.tablesUsed === 1 ? '' : 's'}. Assignments are now live.${applyErrors.length > 0 ? ` (${applyErrors.length} errors during apply)` : ''}`,
    instruction: 'IMPORTANT: Report these results to the user NOW. Show the summary, highlight notable placements (donors with scholars), and give the score. Do NOT describe a plan — the seating is DONE.',
  });
}

function scoreSeating(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.assignments.length === 0) {
    return errorResult('No seating assignments exist to score.');
  }

  const score = scoreExistingSeating({
    tables: ctx.tables,
    guests: ctx.guests,
    existingAssignments: ctx.assignments,
    relationshipGroups: ctx.groups,
    relationshipMemberships: ctx.memberships,
    versionId: ctx.versionId,
  });

  return json({
    summary: `Seating score: ${score.overall}/100 for ${ctx.assignments.length} assignments`,
    score,
    assignmentCount: ctx.assignments.length,
    versionId: ctx.versionId,
  });
}

function getSeatingRecommendationsTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const recommendations = getSeatingRecommendations({
    tables: ctx.tables,
    guests: ctx.guests,
    existingAssignments: ctx.assignments,
    relationshipGroups: ctx.groups,
    relationshipMemberships: ctx.memberships,
    versionId: ctx.versionId,
  });

  if (input.limit !== undefined) {
    const numErr = validateNumber(input.limit, 'limit');
    if (numErr) return errorResult(numErr);
  }
  const limit =
    typeof input.limit === 'number' ? input.limit : recommendations.length;
  const limited = recommendations.slice(0, limit);

  return json({
    summary: `${recommendations.length} seating recommendation${recommendations.length === 1 ? '' : 's'} available (showing ${limited.length})`,
    totalRecommendations: recommendations.length,
    showing: limited.length,
    recommendations: limited.map((r) => {
      const guest = ctx.guests.find((g) => g.id === r.guestId);
      const table = ctx.tables.find((t) => t.id === r.tableId);
      return {
        guestId: r.guestId,
        guestName: guest?.displayName ?? 'Unknown',
        tableId: r.tableId,
        tableNumber: table?.tableNumber ?? null,
        tableName: table?.name ?? 'Unknown',
        reason: r.reason,
        priority: r.priority,
      };
    }),
  });
}

function getTableInfo(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const seatingAnalytics = analyzeSeating(
    ctx.tables,
    ctx.assignments,
    ctx.guests,
    ctx.groups,
    ctx.memberships,
    ctx.versionId,
  );

  // Build full table data with guest names
  const allTableData = seatingAnalytics.tableUtilization.map((t) => {
    const tableAssignments = ctx.assignments.filter((a) => a.tableId === t.table.id);
    const seatedGuests = tableAssignments.map((a) => {
      const guest = ctx.guests.find((g) => g.id === a.guestId);
      return guest
        ? { id: guest.id, name: guest.displayName, category: guest.category, rsvpStatus: guest.rsvpStatus, organization: guest.organization || undefined, seatNumber: a.seatNumber ?? null }
        : null;
    }).filter(Boolean);

    return {
      tableId: t.table.id,
      tableNumber: t.table.tableNumber ?? null,
      tableName: t.table.name,
      type: t.table.type,
      capacity: t.capacity,
      seated: t.seated,
      utilizationPct: t.utilizationPct,
      hasAnchor: t.hasAnchor,
      anchorGroupName: t.anchorGroupName ?? null,
      guests: seatedGuests,
    };
  });

  // Filter to specific table if requested
  const requestedTableId = input.tableId as string | undefined;
  const requestedTableNumber = input.tableNumber as number | undefined;

  let filteredTables = allTableData;
  if (requestedTableId) {
    filteredTables = allTableData.filter((t) => t.tableId === requestedTableId);
  } else if (requestedTableNumber != null) {
    filteredTables = allTableData.filter((t) => t.tableNumber === requestedTableNumber);
  }

  if ((requestedTableId || requestedTableNumber != null) && filteredTables.length === 0) {
    return errorResult(`Table ${requestedTableNumber ?? requestedTableId} not found.`);
  }

  // If querying a specific table, return focused response
  if (filteredTables.length === 1) {
    const t = filteredTables[0];
    return json({
      summary: `Table ${t.tableNumber ?? t.tableName}: ${t.seated}/${t.capacity} seats filled`,
      ...t,
    });
  }

  return json({
    summary: `${seatingAnalytics.totalTables} tables, ${seatingAnalytics.seatedGuests}/${seatingAnalytics.totalCapacity} seats filled (${seatingAnalytics.averageUtilization}% utilization)`,
    totalTables: seatingAnalytics.totalTables,
    totalCapacity: seatingAnalytics.totalCapacity,
    seatedGuests: seatingAnalytics.seatedGuests,
    unseatedConfirmed: seatingAnalytics.unseatedConfirmed,
    averageUtilization: seatingAnalytics.averageUtilization,
    emptyTables: seatingAnalytics.emptyTables,
    fullTables: seatingAnalytics.fullTables,
    overCapacityTables: seatingAnalytics.overCapacityTables,
    tables: filteredTables,
  });
}

function generateEmailDraft(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'guestId');
  if (reqErr) return errorResult(reqErr);

  const guestId = input.guestId as string;
  const templateType = input.templateType as string | undefined;

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) {
    return errorResult(`Guest "${guestId}" not found in event "${eventId}".`);
  }

  const templates = getDefaultCommTemplates();
  const template = templateType
    ? templates.find((t) => t.type === templateType)
    : templates[0]; // default to RSVP reminder

  if (!template) {
    return errorResult(
      `Template type "${templateType}" not found. Available types: ${templates.map((t) => t.type).join(', ')}`,
    );
  }

  // Look up table name if guest is seated
  let tableName: string | undefined;
  const assignment = ctx.assignments.find((a) => a.guestId === guestId);
  if (assignment) {
    const table = ctx.tables.find((t) => t.id === assignment.tableId);
    tableName = table?.name;
  }

  const rendered = renderTemplate(template, guest, ctx.event, tableName);

  return json({
    summary: `Email draft for ${guest.displayName} using '${template.name}' template`,
    templateUsed: template.name,
    templateType: template.type,
    guestName: guest.displayName,
    email: guest.email,
    subject: rendered.subject,
    body: rendered.body,
  });
}

function flagIssues(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const { event, guests, tables, assignments, versions, groups, memberships } =
    ctx;

  const health = computeEventHealth(event, guests, tables, assignments, versions);
  const guestAnalytics = analyzeGuests(guests, eventId);
  const seatingAnalytics = analyzeSeating(
    tables,
    assignments,
    guests,
    groups,
    memberships,
    ctx.versionId,
  );

  const insights = generateInsights(
    event,
    guestAnalytics,
    seatingAnalytics,
    health,
  );

  // Only return non-dismissed, actionable insights (alerts and action_needed)
  const activeAlerts = insights.filter(
    (i) => !i.dismissed && (i.type === 'alert' || i.type === 'action_needed'),
  );

  return json({
    summary: activeAlerts.length === 0
      ? `No issues found. Health score: ${health.overall}/100`
      : `${activeAlerts.length} issue${activeAlerts.length === 1 ? '' : 's'} flagged. Health score: ${health.overall}/100`,
    healthScore: health.overall,
    issueCount: activeAlerts.length,
    issues: activeAlerts.map((i) => ({
      id: i.id,
      type: i.type,
      priority: i.priority,
      category: i.category,
      title: i.title,
      description: i.description,
      actionLabel: i.actionLabel ?? null,
      actionType: i.actionType ?? null,
    })),
  });
}

function getAttendanceProjection(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.guests.length === 0) {
    return errorResult('No guests found for this event.');
  }

  const projection = computeAttendanceProjection(ctx.guests);

  return json({
    summary: `Projected attendance: ${projection.expected} (range: ${projection.low}-${projection.high})`,
    eventId,
    projection,
  });
}

function getRsvpSummaryTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const { guests } = ctx;
  if (guests.length === 0) {
    return errorResult('No guests found for this event.');
  }

  // Group guests by RSVP status
  const byStatus: Record<RSVPStatus, Guest[]> = {
    invited: [],
    confirmed: [],
    declined: [],
    waitlist: [],
    checked_in: [],
  };
  for (const g of guests) {
    byStatus[g.rsvpStatus].push(g);
  }

  // Build status breakdown with names (first 10 per status, "and X more" for large lists)
  const statusBreakdown: Record<string, { count: number; names: string[]; overflow?: string }> = {};
  for (const status of VALID_RSVP) {
    const list = byStatus[status];
    if (list.length === 0) {
      statusBreakdown[status] = { count: 0, names: [] };
      continue;
    }
    const names = list.slice(0, 10).map((g) => g.displayName);
    const entry: { count: number; names: string[]; overflow?: string } = {
      count: list.length,
      names,
    };
    if (list.length > 10) {
      entry.overflow = `and ${list.length - 10} more`;
    }
    statusBreakdown[status] = entry;
  }

  // Response rate: responded = confirmed + declined + checked_in vs total
  const respondedCount =
    byStatus.confirmed.length + byStatus.declined.length + byStatus.checked_in.length;
  const responseRate =
    guests.length > 0
      ? Math.round((respondedCount / guests.length) * 100)
      : 0;

  // High-priority non-responders: donors, VIPs, board_members with rsvpStatus "invited"
  const highPriorityCategories: GuestCategory[] = ['donor', 'vip', 'board_member'];
  const highPriorityNonResponders = guests
    .filter(
      (g) =>
        highPriorityCategories.includes(g.category) &&
        g.rsvpStatus === 'invited',
    )
    .map((g) => ({
      displayName: g.displayName,
      email: g.email,
      category: g.category,
    }));

  // Total expected attendance: sum of partySize for confirmed + checked_in
  const totalExpectedAttendance = [...byStatus.confirmed, ...byStatus.checked_in].reduce(
    (sum, g) => sum + (g.partySize || 1),
    0,
  );

  // Category breakdown within each RSVP status
  const categoryByStatus: Record<string, Record<string, number>> = {};
  for (const status of VALID_RSVP) {
    const catCounts: Record<string, number> = {};
    for (const g of byStatus[status]) {
      catCounts[g.category] = (catCounts[g.category] || 0) + 1;
    }
    if (Object.keys(catCounts).length > 0) {
      categoryByStatus[status] = catCounts;
    }
  }

  // Build readable category summary strings (e.g. "15 donors, 143 scholars")
  const categoryLabel: Record<string, string> = {
    donor: 'donors',
    scholarship_recipient: 'scholars',
    family: 'family',
    board_member: 'board members',
    vip: 'VIPs',
    staff: 'staff',
    sponsor: 'sponsors',
    volunteer: 'volunteers',
    dignitary: 'dignitaries',
    other: 'other',
  };
  const categorySummaryByStatus: Record<string, string> = {};
  for (const status of VALID_RSVP) {
    if (categoryByStatus[status]) {
      categorySummaryByStatus[status] = Object.entries(categoryByStatus[status])
        .map(([cat, count]) => `${count} ${categoryLabel[cat] ?? cat}`)
        .join(', ');
    }
  }

  return json({
    summary: `RSVP summary: ${respondedCount}/${guests.length} responded (${responseRate}%), ${totalExpectedAttendance} expected attendees, ${highPriorityNonResponders.length} high-priority non-responders`,
    eventId,
    totalGuests: guests.length,
    responseRate,
    respondedCount,
    totalExpectedAttendance,
    statusBreakdown,
    categoryByStatus: categorySummaryByStatus,
    highPriorityNonResponders,
  });
}

function analyzeDietaryNeedsTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.guests.length === 0) {
    return errorResult('No guests found for this event.');
  }

  const analysis = analyzeDietaryNeeds(ctx.guests);

  return json({
    summary: `${analysis.totalWithRestrictions ?? 0} guest${(analysis.totalWithRestrictions ?? 0) === 1 ? '' : 's'} with dietary restrictions out of ${ctx.guests.length}`,
    eventId,
    ...analysis,
  });
}

// ---------------------------------------------------------------------------
// WRITE tools — these mutate the store
// ---------------------------------------------------------------------------

function updateGuestTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'guestId');
  if (reqErr) return errorResult(reqErr);
  const guestId = input.guestId as string;

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) return errorResult(`Guest '${guestId}' not found in this event.`);

  if (input.partySize !== undefined) {
    const numErr = validateNumber(input.partySize, 'partySize');
    if (numErr) return errorResult(numErr);
  }

  const store = useEventStore.getState();
  const updates: Partial<Guest> = {};

  if (input.rsvpStatus !== undefined) updates.rsvpStatus = normalizeRsvp(input.rsvpStatus);
  if (input.category !== undefined) updates.category = normalizeCategory(input.category);
  if (input.partySize !== undefined) updates.partySize = input.partySize as number;
  if (input.dietaryRestrictions !== undefined) updates.dietaryRestrictions = input.dietaryRestrictions as string;
  if (input.accessibilityNeeds !== undefined) updates.accessibilityNeeds = input.accessibilityNeeds as string;
  if (input.notes !== undefined) updates.notes = input.notes as string;
  if (input.tablePreference !== undefined) updates.tablePreference = input.tablePreference as string;
  if (input.seatingPreference !== undefined) updates.seatingPreference = input.seatingPreference as string;
  if (input.firstName !== undefined) updates.firstName = input.firstName as string;
  if (input.lastName !== undefined) updates.lastName = input.lastName as string;
  if (input.email !== undefined) updates.email = input.email as string;
  if (input.phone !== undefined) updates.phone = input.phone as string;
  if (input.organization !== undefined) updates.organization = input.organization as string;

  if (updates.firstName || updates.lastName) {
    updates.displayName = `${updates.firstName ?? guest.firstName} ${updates.lastName ?? guest.lastName}`;
  }

  store.updateGuest(guestId, updates);

  const finalName = updates.displayName ?? guest.displayName;
  return json({
    summary: `Updated ${finalName}: changed ${Object.keys(updates).join(', ')}`,
    updated: true,
    guestId,
    guestName: finalName,
    fieldsChanged: Object.keys(updates),
  });
}

function deleteGuestsTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const guestIds = input.guestIds as string[] | undefined;
  const filter = input.filter as string | undefined;

  const store = useEventStore.getState();
  let toDelete: string[] = [];

  if (guestIds && guestIds.length > 0) {
    // Delete specific guests by ID
    const validIds = guestIds.filter((id) => ctx.guests.some((g) => g.id === id));
    toDelete = validIds;
  } else if (filter) {
    // Delete by filter criteria
    const filterLower = filter.toLowerCase();
    if (filterLower === 'csv_imports' || filterLower === 'csv imports' || filterLower === 'duplicates') {
      toDelete = ctx.guests.filter((g) => g.id.startsWith('csv-import-')).map((g) => g.id);
    } else if (filterLower.startsWith('id_prefix:')) {
      const prefix = filterLower.replace('id_prefix:', '').trim();
      toDelete = ctx.guests.filter((g) => g.id.startsWith(prefix)).map((g) => g.id);
    }
  }

  if (toDelete.length === 0) {
    return errorResult('No matching guests found to delete. Use guestIds array or filter ("csv_imports", "id_prefix:xxx").');
  }

  const deletedNames: string[] = [];
  for (const id of toDelete) {
    const guest = ctx.guests.find((g) => g.id === id);
    if (guest) deletedNames.push(guest.displayName);
    store.removeGuest(id);
  }

  return json({
    summary: `Deleted ${toDelete.length} guest${toDelete.length === 1 ? '' : 's'}`,
    deleted: toDelete.length,
    deletedIds: toDelete.slice(0, 20),
    deletedNames: deletedNames.slice(0, 20),
    note: toDelete.length > 20 ? `Showing first 20 of ${toDelete.length} deleted.` : undefined,
  });
}

function bulkUpdateGuestsTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const guestIds = input.guestIds as string[] | undefined;
  const filter = input.filter as string | undefined;
  const updates: Partial<Guest> = {};

  if (input.partySize !== undefined) {
    const numErr = validateNumber(input.partySize, 'partySize');
    if (numErr) return errorResult(numErr);
  }

  if (input.rsvpStatus !== undefined) updates.rsvpStatus = normalizeRsvp(input.rsvpStatus);
  if (input.category !== undefined) updates.category = normalizeCategory(input.category);
  if (input.partySize !== undefined) updates.partySize = input.partySize as number;

  if (Object.keys(updates).length === 0) {
    return errorResult('No update fields provided. Provide rsvpStatus, category, or partySize.');
  }

  const store = useEventStore.getState();
  let targets: string[] = [];

  if (guestIds && guestIds.length > 0) {
    targets = guestIds.filter((id) => ctx.guests.some((g) => g.id === id));
  } else if (filter) {
    const filterLower = filter.toLowerCase();
    if (filterLower === 'all') {
      targets = ctx.guests.map((g) => g.id);
    } else if (filterLower === 'csv_imports') {
      targets = ctx.guests.filter((g) => g.id.startsWith('csv-import-')).map((g) => g.id);
    } else if (filterLower.startsWith('category:')) {
      const cat = filterLower.replace('category:', '').trim();
      targets = ctx.guests.filter((g) => g.category.toLowerCase().replace(/\s+/g, '_') === cat).map((g) => g.id);
    } else if (filterLower.startsWith('rsvp:')) {
      const rsvp = filterLower.replace('rsvp:', '').trim();
      targets = ctx.guests.filter((g) => g.rsvpStatus.toLowerCase().replace(/\s+/g, '_') === rsvp).map((g) => g.id);
    }
  }

  if (targets.length === 0) {
    return errorResult('No matching guests. Use guestIds, or filter: "all", "csv_imports", "category:donor", "rsvp:invited".');
  }

  for (const id of targets) {
    store.updateGuest(id, updates);
  }

  return json({
    summary: `Bulk-updated ${targets.length} guest${targets.length === 1 ? '' : 's'}: changed ${Object.keys(updates).join(', ')}`,
    updated: targets.length,
    fieldsChanged: Object.keys(updates),
    newValues: updates,
  });
}

function moveGuestToTableTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  // Accept either guestId or guestName — resolve guestName to guestId via fuzzy search
  let guestId = input.guestId as string | undefined;
  const guestName = input.guestName as string | undefined;

  if (!guestId && guestName) {
    const needle = guestName.toLowerCase();
    const match = ctx.guests.find((g) => g.displayName.toLowerCase() === needle)
      ?? ctx.guests.find((g) => g.displayName.toLowerCase().includes(needle));
    if (!match) {
      return errorResult(
        `No guest found matching name "${guestName}". Use search_guests to find the correct guest first.`,
      );
    }
    guestId = match.id;
  }

  if (!guestId) {
    return errorResult("Either 'guestId' or 'guestName' is required.");
  }
  let tableId = input.tableId as string | undefined;
  const tableNumber = coerceNumber(input.tableNumber) as number | undefined;

  if (tableNumber != null) {
    const numErr = validateNumber(tableNumber, 'tableNumber');
    if (numErr) return errorResult(numErr);
  }

  // Resolve table by number if tableId not provided
  if (!tableId && tableNumber != null) {
    const tableByNumber = ctx.tables.find((t) => t.tableNumber === tableNumber);
    if (!tableByNumber) {
      return errorResult(
        `No table with number ${tableNumber}. Valid table numbers: ${validTableNumbers(ctx.tables)}`,
      );
    }
    tableId = tableByNumber.id;
  }

  if (!tableId) return errorResult("Either 'tableId' or 'tableNumber' is required.");

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) return errorResult(`Guest '${guestId}' not found in this event.`);

  const table = ctx.tables.find((t) => t.id === tableId);
  if (!table) {
    return errorResult(
      `Table '${tableId}' not found. Valid tables: ${validTableNumbers(ctx.tables)}`,
    );
  }

  // Check table capacity
  const currentOccupants = ctx.assignments.filter((a) => a.tableId === tableId && a.guestId !== guestId).length;
  if (table.capacity > 0 && currentOccupants >= table.capacity) {
    return errorResult(
      `${table.tableNumber != null ? `Table ${table.tableNumber}` : table.name} is full (${currentOccupants}/${table.capacity}). Remove a guest first or choose another table.`,
    );
  }

  const store = useEventStore.getState();
  store.moveGuestToTable(guestId, tableId, ctx.versionId);

  const tableLabel = table.tableNumber != null ? `Table ${table.tableNumber}` : table.name;
  return json({
    summary: `Moved ${guest.displayName} to ${tableLabel}`,
    moved: true,
    guestName: guest.displayName,
    tableNumber: table.tableNumber ?? null,
    tableName: table.name,
  });
}

function swapGuestsTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'guestId1', 'guestId2');
  if (reqErr) return errorResult(reqErr);

  const guestId1 = input.guestId1 as string;
  const guestId2 = input.guestId2 as string;

  const guest1 = ctx.guests.find((g) => g.id === guestId1);
  const guest2 = ctx.guests.find((g) => g.id === guestId2);
  if (!guest1) return errorResult(`Guest '${guestId1}' not found in this event.`);
  if (!guest2) return errorResult(`Guest '${guestId2}' not found in this event.`);

  const assignment1 = ctx.assignments.find((a) => a.guestId === guestId1);
  const assignment2 = ctx.assignments.find((a) => a.guestId === guestId2);
  if (!assignment1) return errorResult(`${guest1.displayName} is not currently seated.`);
  if (!assignment2) return errorResult(`${guest2.displayName} is not currently seated.`);

  const table1 = ctx.tables.find((t) => t.id === assignment1.tableId);
  const table2 = ctx.tables.find((t) => t.id === assignment2.tableId);

  const store = useEventStore.getState();

  // Remove both assignments, then recreate them swapped
  store.removeSeatingAssignment(assignment1.id);
  store.removeSeatingAssignment(assignment2.id);
  store.moveGuestToTable(guestId1, assignment2.tableId, ctx.versionId);
  store.moveGuestToTable(guestId2, assignment1.tableId, ctx.versionId);

  return json({
    summary: `Swapped ${guest1.displayName} (now at ${table2?.name ?? 'Unknown'}) and ${guest2.displayName} (now at ${table1?.name ?? 'Unknown'})`,
    swapped: true,
    guest1: { name: guest1.displayName, from: table1?.name ?? 'Unknown', to: table2?.name ?? 'Unknown' },
    guest2: { name: guest2.displayName, from: table2?.name ?? 'Unknown', to: table1?.name ?? 'Unknown' },
  });
}

function unseatGuestTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'guestId');
  if (reqErr) return errorResult(reqErr);
  const guestId = input.guestId as string;

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) return errorResult(`Guest '${guestId}' not found in this event.`);

  const assignment = ctx.assignments.find((a) => a.guestId === guestId);
  if (!assignment) return errorResult(`${guest.displayName} has no seating assignment to remove.`);

  const table = ctx.tables.find((t) => t.id === assignment.tableId);
  const store = useEventStore.getState();
  store.removeSeatingAssignment(assignment.id);

  return json({
    summary: `Unseated ${guest.displayName} from ${table?.name ?? 'their table'}`,
    unseated: true,
    guestName: guest.displayName,
  });
}

function clearAllSeatingTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.assignments.length === 0) {
    return json({
      summary: 'No seating assignments to clear — starting fresh.',
      cleared: 0,
      note: 'No existing assignments found for this version. Ready for seating.',
    });
  }

  const store = useEventStore.getState();
  const count = ctx.assignments.length;
  for (const a of ctx.assignments) {
    store.removeSeatingAssignment(a.id);
  }

  return json({
    summary: `Cleared all ${count} seating assignment${count === 1 ? '' : 's'}`,
    cleared: count,
    note: `All ${count} seating assignments for this version have been removed.`,
  });
}

async function runRefinementLoopTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): Promise<string> {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.tables.length === 0) {
    return errorResult(
      'No tables exist in the active layout version. Use the add_table tool to create tables first (e.g. add_table with capacity 8).',
    );
  }

  if (input.maxIterations !== undefined) {
    const numErr = validateNumber(input.maxIterations, 'maxIterations');
    if (numErr) return errorResult(numErr);
  }
  const maxIterations = typeof input.maxIterations === 'number' ? input.maxIterations : 20;

  try {
    const result = await runRefinementLoop(eventId, maxIterations);
    return json({
      success: true,
      summary: formatRefinementSummary(result),
      initialScore: result.initialScore.overall,
      finalScore: result.finalScore.overall,
      delta: result.delta,
      iterations: result.iterations,
      swapsApplied: result.swapsApplied.length,
      unseatedPlaced: result.unseatedPlaced.length,
      plateauReached: result.plateauReached,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    return errorResult(`Refinement loop failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// EVENT MANAGEMENT tools
// ---------------------------------------------------------------------------

function createEventTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const reqErr = validateRequired(input, 'name', 'date');
  if (reqErr) return errorResult(reqErr);

  const name = input.name as string;
  const type = (input.type as AppEvent['type']) ?? 'other';
  const date = input.date as string;

  const store = useEventStore.getState();
  const orgId = state.activeOrgId ?? 'org-default';
  const newEventId = `evt-${crypto.randomUUID()}`;
  const versionId = `ver-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const newEvent: AppEvent = {
    id: newEventId,
    orgId,
    name,
    type,
    status: 'planning',
    date,
    time: (input.time as string) ?? '',
    venue: (input.venue as string) ?? '',
    venueAddress: (input.venueAddress as string) ?? '',
    estimatedAttendance: (input.estimatedAttendance as number) ?? 0,
    notes: (input.notes as string) ?? '',
    activeVersionId: versionId,
    createdAt: now,
    updatedAt: now,
  };

  const initialVersion: EventVersion = {
    id: versionId,
    eventId: newEventId,
    name: 'Version 1',
    status: 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: 'franck-agent',
    notes: 'Initial version created by Franck.',
  };

  store.addEvent(newEvent);
  store.addVersion(initialVersion);

  return json({
    summary: `Created event '${newEvent.name}' (${newEvent.type}) on ${newEvent.date}`,
    created: true,
    eventId: newEventId,
    versionId,
    name: newEvent.name,
    type: newEvent.type,
    date: newEvent.date,
    venue: newEvent.venue,
  });
}

function updateEventTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return eventNotFoundError(eventId);

  const store = useEventStore.getState();
  const updates: Partial<AppEvent> = {};

  if (input.name !== undefined) updates.name = input.name as string;
  if (input.type !== undefined) updates.type = input.type as AppEvent['type'];
  if (input.status !== undefined) updates.status = input.status as AppEvent['status'];
  if (input.date !== undefined) updates.date = input.date as string;
  if (input.time !== undefined) updates.time = input.time as string;
  if (input.venue !== undefined) updates.venue = input.venue as string;
  if (input.venueAddress !== undefined) updates.venueAddress = input.venueAddress as string;
  if (input.estimatedAttendance !== undefined) updates.estimatedAttendance = input.estimatedAttendance as number;
  if (input.notes !== undefined) updates.notes = input.notes as string;
  updates.updatedAt = new Date().toISOString();

  if (Object.keys(updates).length <= 1) {
    return errorResult('No update fields provided.');
  }

  store.updateEvent(eventId, updates);

  const changedFields = Object.keys(updates).filter((k) => k !== 'updatedAt');
  return json({
    summary: `Updated event: changed ${changedFields.join(', ')}`,
    updated: true,
    eventId,
    fieldsChanged: changedFields,
  });
}

function listEventsTool(
  state: StoreState,
  _eventId: string,
  _input: ToolInput,
): string {
  const orgId = state.activeOrgId;
  const events = orgId
    ? state.events.filter((e) => e.orgId === orgId)
    : state.events;

  return json({
    summary: `${events.length} event${events.length === 1 ? '' : 's'} found`,
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      status: e.status,
      date: e.date,
      venue: e.venue,
      guestCount: state.guests.filter((g) => g.eventId === e.id).length,
    })),
  });
}

// ---------------------------------------------------------------------------
// GUEST ADD tools
// ---------------------------------------------------------------------------

function addGuestTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'firstName', 'lastName');
  if (reqErr) return errorResult(reqErr);

  const firstName = input.firstName as string;
  const lastName = input.lastName as string;

  // Duplicate check: warn if a guest with matching name already exists
  const nameLower = `${firstName} ${lastName}`.toLowerCase();
  const existing = ctx.guests.find(
    (g) => g.displayName.toLowerCase() === nameLower,
  );
  if (existing) {
    const emailMatch = input.email && existing.email && (input.email as string).toLowerCase() === existing.email.toLowerCase();
    return json({
      summary: `Duplicate detected: "${existing.displayName}" already exists (ID: ${existing.id})${emailMatch ? ' with matching email' : ''}. Use update_guest to modify the existing record instead.`,
      duplicate: true,
      existingGuestId: existing.id,
      existingDisplayName: existing.displayName,
    });
  }

  const store = useEventStore.getState();
  const guestId = `guest-${crypto.randomUUID()}`;

  const guest: Guest = {
    id: guestId,
    orgId: ctx.event.orgId,
    eventId,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`,
    email: (input.email as string) ?? '',
    phone: (input.phone as string) ?? '',
    organization: (input.organization as string) ?? '',
    category: normalizeCategory(input.category),
    rsvpStatus: normalizeRsvp(input.rsvpStatus),
    partySize: (input.partySize as number) ?? 1,
    dietaryRestrictions: (input.dietaryRestrictions as string) ?? '',
    accessibilityNeeds: (input.accessibilityNeeds as string) ?? '',
    notes: (input.notes as string) ?? '',
    relationshipTags: Array.isArray(input.relationshipTags) ? input.relationshipTags as string[] : [],
    tablePreference: (input.tablePreference as string) ?? '',
    seatingPreference: (input.seatingPreference as string) ?? '',
  };

  store.addGuest(guest);

  return json({
    summary: `Added guest ${guest.displayName} (${guest.category}, ${guest.rsvpStatus})`,
    added: true,
    guestId,
    displayName: guest.displayName,
    category: guest.category,
    rsvpStatus: guest.rsvpStatus,
  });
}

function addGuestsBulkTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const guestsInput = input.guests as Array<Record<string, unknown>> | undefined;
  if (!guestsInput || guestsInput.length === 0) return errorResult('guests array is required and must not be empty.');

  const store = useEventStore.getState();
  const added: Array<{ guestId: string; displayName: string }> = [];
  const skippedDuplicates: Array<{ displayName: string; existingId: string }> = [];

  // Build a set of existing names for fast lookup
  const existingNames = new Set(ctx.guests.map((g) => g.displayName.toLowerCase()));

  for (const g of guestsInput) {
    const firstName = g.firstName as string | undefined;
    const lastName = g.lastName as string | undefined;
    if (!firstName || !lastName) continue;

    // Skip duplicates by name match
    const displayName = `${firstName} ${lastName}`;
    const nameLower = displayName.toLowerCase();
    if (existingNames.has(nameLower)) {
      const existing = ctx.guests.find((eg) => eg.displayName.toLowerCase() === nameLower);
      skippedDuplicates.push({ displayName, existingId: existing?.id ?? 'unknown' });
      continue;
    }
    // Also prevent duplicates within the same bulk call
    existingNames.add(nameLower);

    const guestId = `guest-${crypto.randomUUID()}`;

    const guest: Guest = {
      id: guestId,
      orgId: ctx.event.orgId,
      eventId,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      email: (g.email as string) ?? '',
      phone: (g.phone as string) ?? '',
      organization: (g.organization as string) ?? '',
      category: normalizeCategory(g.category),
      rsvpStatus: normalizeRsvp(g.rsvpStatus),
      partySize: (g.partySize as number) ?? 1,
      dietaryRestrictions: (g.dietaryRestrictions as string) ?? '',
      accessibilityNeeds: (g.accessibilityNeeds as string) ?? '',
      notes: (g.notes as string) ?? '',
      relationshipTags: Array.isArray(g.relationshipTags) ? g.relationshipTags as string[] : [],
      tablePreference: (g.tablePreference as string) ?? '',
      seatingPreference: (g.seatingPreference as string) ?? '',
    };

    store.addGuest(guest);
    added.push({ guestId, displayName: guest.displayName });
  }

  const skippedMissingName = guestsInput.length - added.length - skippedDuplicates.length;
  const parts: string[] = [`Added ${added.length} guest${added.length === 1 ? '' : 's'}`];
  if (skippedDuplicates.length > 0) parts.push(`skipped ${skippedDuplicates.length} duplicate${skippedDuplicates.length === 1 ? '' : 's'}`);
  if (skippedMissingName > 0) parts.push(`skipped ${skippedMissingName} (missing name)`);
  return json({
    summary: parts.join(', '),
    added: added.length,
    skippedDuplicates: skippedDuplicates.length,
    skippedMissingName,
    guests: added,
    duplicates: skippedDuplicates.length > 0 ? skippedDuplicates : undefined,
  });
}

// ---------------------------------------------------------------------------
// LAYOUT / TABLE tools
// ---------------------------------------------------------------------------

function addTableTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (input.capacity !== undefined) {
    const numErr = validateNumber(input.capacity, 'capacity');
    if (numErr) return errorResult(numErr);
  }

  const store = useEventStore.getState();
  const tableType = (input.type as 'round_table' | 'rect_table') ?? 'round_table';
  const capacity = (input.capacity as number) ?? 8;
  const id = `lo-${crypto.randomUUID()}`;

  // Auto-assign table number (sequential, no gaps)
  const tableNumber = ctx.tables.length + 1;

  const tableName = (input.name as string) ?? `Table ${tableNumber}`;

  const isRound = tableType === 'round_table';
  const width = isRound ? 80 : 120;
  const height = isRound ? 80 : 40;

  // Position new tables in a grid pattern
  const column = ctx.tables.length % 4;
  const row = Math.floor(ctx.tables.length / 4);

  const layoutObject: LayoutObject = {
    id,
    versionId: ctx.versionId,
    type: tableType,
    name: tableName,
    tableNumber,
    x: 60 + column * 140,
    y: 60 + row * 110,
    width,
    height,
    rotation: 0,
    capacity,
    notes: '',
    category: 'seating',
    locked: false,
    visible: true,
    zIndex: 100 + ctx.tables.length,
  };

  store.addLayoutObject(layoutObject);

  return json({
    summary: `Added ${tableName} (${tableType}, capacity ${capacity})`,
    added: true,
    tableId: id,
    tableNumber,
    name: tableName,
    type: tableType,
    capacity,
  });
}

function removeTableTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  let tableId = input.tableId as string | undefined;
  const tableNumber = input.tableNumber as number | undefined;

  if (tableNumber != null) {
    const numErr = validateNumber(tableNumber, 'tableNumber');
    if (numErr) return errorResult(numErr);
  }

  if (!tableId && tableNumber != null) {
    const table = ctx.tables.find((t) => t.tableNumber === tableNumber);
    if (!table) {
      return errorResult(
        `No table with number ${tableNumber}. Valid table numbers: ${validTableNumbers(ctx.tables)}`,
      );
    }
    tableId = table.id;
  }

  if (!tableId) return errorResult("Either 'tableId' or 'tableNumber' is required.");

  const table = ctx.tables.find((t) => t.id === tableId);
  if (!table) {
    return errorResult(
      `Table '${tableId}' not found. Valid tables: ${validTableNumbers(ctx.tables)}`,
    );
  }

  const store = useEventStore.getState();

  // Unseat all guests at this table
  const tableAssignments = ctx.assignments.filter((a) => a.tableId === tableId);
  for (const a of tableAssignments) {
    store.removeSeatingAssignment(a.id);
  }

  store.removeLayoutObject(tableId);

  return json({
    summary: `Removed ${table.name}${tableAssignments.length > 0 ? ` and unseated ${tableAssignments.length} guest${tableAssignments.length === 1 ? '' : 's'}` : ''}`,
    removed: true,
    tableId,
    tableNumber: table.tableNumber ?? null,
    tableName: table.name,
    guestsUnseated: tableAssignments.length,
  });
}

function updateTableTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  let tableId = input.tableId as string | undefined;
  const tableNumber = input.tableNumber as number | undefined;

  if (tableNumber != null) {
    const numErr = validateNumber(tableNumber, 'tableNumber');
    if (numErr) return errorResult(numErr);
  }

  if (!tableId && tableNumber != null) {
    const table = ctx.tables.find((t) => t.tableNumber === tableNumber);
    if (!table) {
      return errorResult(
        `No table with number ${tableNumber}. Valid table numbers: ${validTableNumbers(ctx.tables)}`,
      );
    }
    tableId = table.id;
  }

  if (!tableId) return errorResult("Either 'tableId' or 'tableNumber' is required.");

  const table = ctx.tables.find((t) => t.id === tableId);
  if (!table) {
    return errorResult(
      `Table '${tableId}' not found. Valid tables: ${validTableNumbers(ctx.tables)}`,
    );
  }

  if (input.capacity !== undefined) {
    const numErr = validateNumber(input.capacity, 'capacity');
    if (numErr) return errorResult(numErr);
  }

  const store = useEventStore.getState();
  const updates: Partial<LayoutObject> = {};

  if (input.name !== undefined) updates.name = input.name as string;
  if (input.capacity !== undefined) updates.capacity = input.capacity as number;

  if (Object.keys(updates).length === 0) {
    return errorResult('No update fields provided. Provide name or capacity.');
  }

  store.updateLayoutObject(tableId, updates);

  return json({
    summary: `Updated ${table.name}: changed ${Object.keys(updates).join(', ')}`,
    updated: true,
    tableId,
    tableNumber: table.tableNumber ?? null,
    fieldsChanged: Object.keys(updates),
  });
}

// ---------------------------------------------------------------------------
// RELATIONSHIP tools
// ---------------------------------------------------------------------------

function createRelationshipGroupTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'name', 'type');
  if (reqErr) return errorResult(reqErr);

  const name = input.name as string;
  const type = input.type as RelationshipType;

  const store = useEventStore.getState();
  const groupId = `rg-${crypto.randomUUID()}`;

  const group: RelationshipGroup = {
    id: groupId,
    eventId,
    orgId: ctx.event.orgId,
    name,
    type,
    notes: (input.notes as string) ?? undefined,
    createdAt: new Date().toISOString(),
  };

  store.addRelationshipGroup(group);

  return json({
    summary: `Created relationship group '${name}' (${type})`,
    created: true,
    groupId,
    name,
    type,
  });
}

function addToRelationshipGroupTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'groupId', 'guestId', 'role');
  if (reqErr) return errorResult(reqErr);

  const groupId = input.groupId as string;
  const guestId = input.guestId as string;
  const role = input.role as string;

  const group = ctx.groups.find((g) => g.id === groupId);
  if (!group) return errorResult(`Relationship group "${groupId}" not found.`);

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) return errorResult(`Guest "${guestId}" not found.`);

  // Check if already a member
  const existing = ctx.memberships.find(
    (m) => m.groupId === groupId && m.guestId === guestId,
  );
  if (existing) return errorResult(`Guest "${guest.displayName}" is already in group "${group.name}".`);

  const store = useEventStore.getState();
  const membershipId = `rm-${crypto.randomUUID()}`;

  const membership: RelationshipMembership = {
    id: membershipId,
    groupId,
    guestId,
    role,
  };

  store.addRelationshipMembership(membership);

  return json({
    summary: `Added ${guest.displayName} to '${group.name}' as ${role}`,
    added: true,
    membershipId,
    groupName: group.name,
    guestName: guest.displayName,
    role,
  });
}

function listRelationshipGroupsTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  return json({
    summary: `${ctx.groups.length} relationship group${ctx.groups.length === 1 ? '' : 's'}`,
    count: ctx.groups.length,
    groups: ctx.groups.map((g) => {
      const members = ctx.memberships.filter((m) => m.groupId === g.id);
      return {
        id: g.id,
        name: g.name,
        type: g.type,
        notes: g.notes ?? null,
        memberCount: members.length,
        members: members.map((m) => {
          const guest = ctx.guests.find((gu) => gu.id === m.guestId);
          return {
            membershipId: m.id,
            guestId: m.guestId,
            guestName: guest?.displayName ?? 'Unknown',
            role: m.role,
          };
        }),
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// VERSION tools
// ---------------------------------------------------------------------------

function listVersionsTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  return json({
    summary: `${ctx.versions.length} version${ctx.versions.length === 1 ? '' : 's'} (active: ${ctx.activeVersion?.name ?? ctx.event.activeVersionId})`,
    activeVersionId: ctx.event.activeVersionId,
    count: ctx.versions.length,
    versions: ctx.versions.map((v) => ({
      id: v.id,
      name: v.name,
      status: v.status,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      notes: v.notes,
      isActive: v.id === ctx.event.activeVersionId,
    })),
  });
}

function createVersionTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const reqErr = validateRequired(input, 'name');
  if (reqErr) return errorResult(reqErr);

  const name = input.name as string;

  const store = useEventStore.getState();
  const versionId = `ver-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const version: EventVersion = {
    id: versionId,
    eventId,
    name,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    createdBy: 'franck-agent',
    notes: (input.notes as string) ?? '',
  };

  store.addVersion(version);

  return json({
    summary: `Created version '${name}' as draft`,
    created: true,
    versionId,
    name,
    eventId,
    note: 'New version created as draft. Switch the active version in the UI to use it.',
  });
}

// ---------------------------------------------------------------------------
// Layout analysis
// ---------------------------------------------------------------------------

interface SpacingIssue {
  table1: string;
  table2: string;
  distance: number;
  recommendation: string;
}

function analyzeLayoutTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const event = ctx.event;
  const activeVersion = ctx.activeVersion;
  const versionId = ctx.versionId;

  // Get ALL layout objects (tables + decorations + zones etc.)
  const allObjects = state.layoutObjects.filter((o) => o.versionId === versionId);
  const tables = ctx.tables; // round_table | rect_table only

  // Canvas dimensions from version or defaults
  const canvasWidth = activeVersion?.canvasWidth ?? 1200;
  const canvasHeight = activeVersion?.canvasHeight ?? 800;

  // Total capacity from tables
  const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);

  // Confirmed guests count
  const confirmedGuests = ctx.guests.filter(
    (g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in',
  ).length;

  // ---------- Spacing analysis ----------

  const MIN_SPACING = 120; // px — minimum distance between table centers
  const spacingIssues: SpacingIssue[] = [];

  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = tables[i];
      const b = tables[j];
      const cx1 = a.x + a.width / 2;
      const cy1 = a.y + a.height / 2;
      const cx2 = b.x + b.width / 2;
      const cy2 = b.y + b.height / 2;
      const dist = Math.sqrt((cx2 - cx1) ** 2 + (cy2 - cy1) ** 2);
      if (dist < MIN_SPACING) {
        const nameA = a.tableNumber != null ? `Table ${a.tableNumber}` : a.name;
        const nameB = b.tableNumber != null ? `Table ${b.tableNumber}` : b.name;
        spacingIssues.push({
          table1: nameA,
          table2: nameB,
          distance: Math.round(dist),
          recommendation: `Move at least ${Math.round(MIN_SPACING - dist)}px apart`,
        });
      }
    }
  }

  // ---------- Overlap detection ----------

  const overlaps: { table1: string; table2: string }[] = [];
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = tables[i];
      const b = tables[j];
      // Simple axis-aligned bounding box overlap
      const aRight = a.x + a.width;
      const aBottom = a.y + a.height;
      const bRight = b.x + b.width;
      const bBottom = b.y + b.height;
      if (a.x < bRight && aRight > b.x && a.y < bBottom && aBottom > b.y) {
        const nameA = a.tableNumber != null ? `Table ${a.tableNumber}` : a.name;
        const nameB = b.tableNumber != null ? `Table ${b.tableNumber}` : b.name;
        overlaps.push({ table1: nameA, table2: nameB });
      }
    }
  }

  // ---------- Out-of-bounds detection ----------

  const outOfBounds: string[] = [];
  for (const t of tables) {
    if (t.x < 0 || t.y < 0 || t.x + t.width > canvasWidth || t.y + t.height > canvasHeight) {
      outOfBounds.push(t.tableNumber != null ? `Table ${t.tableNumber}` : t.name);
    }
  }

  // ---------- Tables near edges ----------

  const EDGE_MARGIN = 40; // px — tables closer than this to the edge may cause access issues
  const nearEdge: string[] = [];
  for (const t of tables) {
    const tooClose =
      t.x < EDGE_MARGIN ||
      t.y < EDGE_MARGIN ||
      t.x + t.width > canvasWidth - EDGE_MARGIN ||
      t.y + t.height > canvasHeight - EDGE_MARGIN;
    if (tooClose && !outOfBounds.includes(t.tableNumber != null ? `Table ${t.tableNumber}` : t.name)) {
      nearEdge.push(t.tableNumber != null ? `Table ${t.tableNumber}` : t.name);
    }
  }

  // ---------- Empty area detection (quadrant-based) ----------

  const quadrants = [
    { label: 'top-left', xMin: 0, xMax: canvasWidth / 2, yMin: 0, yMax: canvasHeight / 2 },
    { label: 'top-right', xMin: canvasWidth / 2, xMax: canvasWidth, yMin: 0, yMax: canvasHeight / 2 },
    { label: 'bottom-left', xMin: 0, xMax: canvasWidth / 2, yMin: canvasHeight / 2, yMax: canvasHeight },
    { label: 'bottom-right', xMin: canvasWidth / 2, xMax: canvasWidth, yMin: canvasHeight / 2, yMax: canvasHeight },
  ];

  const emptyQuadrants: string[] = [];
  for (const q of quadrants) {
    const tablesInQuadrant = tables.filter((t) => {
      const cx = t.x + t.width / 2;
      const cy = t.y + t.height / 2;
      return cx >= q.xMin && cx < q.xMax && cy >= q.yMin && cy < q.yMax;
    });
    if (tablesInQuadrant.length === 0) {
      emptyQuadrants.push(q.label);
    }
  }

  // ---------- Spacing evenness ----------

  let spacingNote = '';
  if (tables.length >= 3) {
    const distances: number[] = [];
    for (let i = 0; i < tables.length; i++) {
      let minDist = Infinity;
      for (let j = 0; j < tables.length; j++) {
        if (i === j) continue;
        const a = tables[i];
        const b = tables[j];
        const d = Math.sqrt(
          ((a.x + a.width / 2) - (b.x + b.width / 2)) ** 2 +
          ((a.y + a.height / 2) - (b.y + b.height / 2)) ** 2,
        );
        if (d < minDist) minDist = d;
      }
      distances.push(minDist);
    }
    const avg = distances.reduce((s, d) => s + d, 0) / distances.length;
    const variance = distances.reduce((s, d) => s + (d - avg) ** 2, 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > avg * 0.5) {
      spacingNote = 'Table spacing is quite uneven — some tables are bunched while others are isolated.';
    }
  }

  // ---------- Build suggestions ----------

  const suggestions: string[] = [];
  for (const issue of spacingIssues) {
    suggestions.push(`${issue.table1} and ${issue.table2} are only ${issue.distance}px apart — consider spreading them out`);
  }
  for (const ol of overlaps) {
    suggestions.push(`${ol.table1} and ${ol.table2} are overlapping — reposition to avoid collision`);
  }
  if (outOfBounds.length > 0) {
    suggestions.push(`${outOfBounds.join(', ')} extend${outOfBounds.length === 1 ? 's' : ''} outside the canvas bounds`);
  }
  for (const eq of emptyQuadrants) {
    suggestions.push(`The ${eq} area of the venue has no tables — consider using that space`);
  }
  if (nearEdge.length > 0) {
    suggestions.push(`${nearEdge.join(', ')} ${nearEdge.length === 1 ? 'is' : 'are'} very close to the venue edge — consider moving inward for better access`);
  }
  if (spacingNote) {
    suggestions.push(spacingNote);
  }
  if (totalCapacity < confirmedGuests) {
    suggestions.push(`Not enough capacity: ${totalCapacity} seats for ${confirmedGuests} confirmed guests — add more tables or increase table sizes`);
  }

  const issueCount = spacingIssues.length + overlaps.length + outOfBounds.length;
  const summaryParts: string[] = [
    `${tables.length} tables arranged across ${canvasWidth}x${canvasHeight} canvas`,
  ];
  if (issueCount > 0) {
    summaryParts.push(`${issueCount} potential issue${issueCount > 1 ? 's' : ''} found`);
  }
  summaryParts.push(`Total capacity: ${totalCapacity}, confirmed guests: ${confirmedGuests}`);

  return json({
    summary: summaryParts.join('. ') + '.',
    totalTables: tables.length,
    totalObjects: allObjects.length,
    totalCapacity,
    canvasSize: { width: canvasWidth, height: canvasHeight },
    spacingIssues,
    overlaps,
    outOfBounds,
    nearEdge,
    emptyQuadrants,
    capacityCheck: {
      totalCapacity,
      confirmedGuests,
      surplus: totalCapacity - confirmedGuests,
    },
    suggestions,
  });
}

// ---------------------------------------------------------------------------
// GUEST DEDUP / MERGE
// ---------------------------------------------------------------------------

/**
 * Find duplicate guests and optionally merge them.
 * Duplicates are detected by matching firstName+lastName (case-insensitive).
 * When merging, keeps the most complete profile and transfers all relationship
 * memberships and seating assignments to the surviving record.
 */
function deduplicateGuestsTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const action = (input.action as string)?.toLowerCase() ?? 'scan';
  const store = useEventStore.getState();

  // Group guests by normalized name
  const nameGroups = new Map<string, Guest[]>();
  for (const guest of ctx.guests) {
    const key = guest.displayName.toLowerCase().trim();
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key)!.push(guest);
  }

  // Also check by email for guests with different names but same email
  const emailGroups = new Map<string, Guest[]>();
  for (const guest of ctx.guests) {
    if (!guest.email) continue;
    const key = guest.email.toLowerCase().trim();
    if (!emailGroups.has(key)) emailGroups.set(key, []);
    emailGroups.get(key)!.push(guest);
  }

  // Build duplicate clusters
  const duplicateClusters: Array<{
    key: string;
    matchType: 'name' | 'email';
    guests: Guest[];
  }> = [];
  const seen = new Set<string>();

  for (const [name, guests] of nameGroups) {
    if (guests.length < 2) continue;
    duplicateClusters.push({ key: name, matchType: 'name', guests });
    for (const g of guests) seen.add(g.id);
  }

  for (const [email, guests] of emailGroups) {
    if (guests.length < 2) continue;
    // Skip if all these guests were already caught by name matching
    const unseen = guests.filter((g) => !seen.has(g.id));
    if (unseen.length === 0 && guests.every((g) => seen.has(g.id))) {
      // Check if they're in different name groups
      const names = new Set(guests.map((g) => g.displayName.toLowerCase().trim()));
      if (names.size > 1) {
        duplicateClusters.push({ key: email, matchType: 'email', guests });
      }
    }
  }

  if (duplicateClusters.length === 0) {
    return json({
      summary: `No duplicates found among ${ctx.guests.length} guests.`,
      totalGuests: ctx.guests.length,
      duplicateClusters: 0,
    });
  }

  if (action === 'scan') {
    // Just report duplicates
    const report = duplicateClusters.map((cluster) => ({
      matchType: cluster.matchType,
      key: cluster.key,
      count: cluster.guests.length,
      guests: cluster.guests.map((g) => ({
        id: g.id,
        displayName: g.displayName,
        email: g.email || undefined,
        category: g.category,
        rsvpStatus: g.rsvpStatus,
        organization: g.organization || undefined,
        hasNotes: !!g.notes,
        hasDietary: !!g.dietaryRestrictions,
      })),
    }));

    const totalDuplicates = duplicateClusters.reduce((sum, c) => sum + c.guests.length - 1, 0);
    return json({
      summary: `Found ${duplicateClusters.length} duplicate group${duplicateClusters.length === 1 ? '' : 's'} (${totalDuplicates} redundant record${totalDuplicates === 1 ? '' : 's'}) among ${ctx.guests.length} guests. Use action: "merge" to auto-merge, keeping the most complete profile.`,
      totalGuests: ctx.guests.length,
      duplicateClusters: duplicateClusters.length,
      totalRedundant: totalDuplicates,
      clusters: report,
    });
  }

  if (action === 'merge') {
    let merged = 0;
    let removed = 0;
    const mergeLog: string[] = [];

    for (const cluster of duplicateClusters) {
      const guests = [...cluster.guests];

      // Score each guest by data completeness — higher score = more complete
      const scored = guests.map((g) => {
        let score = 0;
        if (g.email) score += 2;
        if (g.phone) score += 1;
        if (g.organization) score += 1;
        if (g.dietaryRestrictions) score += 1;
        if (g.accessibilityNeeds) score += 1;
        if (g.notes) score += 1;
        if (g.category !== 'other') score += 1;
        if (g.rsvpStatus !== 'invited') score += 2; // Confirmed/declined = more info
        if (g.partySize > 1) score += 1;
        if (g.relationshipTags?.length) score += g.relationshipTags.length;
        return { guest: g, score };
      });
      scored.sort((a, b) => b.score - a.score);

      const survivor = scored[0].guest;
      const duplicates = scored.slice(1).map((s) => s.guest);

      // Merge data from duplicates into survivor (fill in blanks)
      const updates: Partial<Guest> = {};
      for (const dup of duplicates) {
        if (!survivor.email && dup.email) updates.email = dup.email;
        if (!survivor.phone && dup.phone) updates.phone = dup.phone;
        if (!survivor.organization && dup.organization) updates.organization = dup.organization;
        if (!survivor.dietaryRestrictions && dup.dietaryRestrictions) updates.dietaryRestrictions = dup.dietaryRestrictions;
        if (!survivor.accessibilityNeeds && dup.accessibilityNeeds) updates.accessibilityNeeds = dup.accessibilityNeeds;
        if (!survivor.notes && dup.notes) updates.notes = dup.notes;
        if (survivor.category === 'other' && dup.category !== 'other') updates.category = dup.category;
        if (survivor.rsvpStatus === 'invited' && dup.rsvpStatus !== 'invited') updates.rsvpStatus = dup.rsvpStatus;
        if (dup.partySize > (updates.partySize ?? survivor.partySize)) updates.partySize = dup.partySize;
        // Merge relationship tags
        const currentTags = new Set(updates.relationshipTags ?? survivor.relationshipTags ?? []);
        for (const tag of dup.relationshipTags ?? []) currentTags.add(tag);
        if (currentTags.size > (survivor.relationshipTags?.length ?? 0)) {
          updates.relationshipTags = Array.from(currentTags);
        }
      }

      // Apply merged data to survivor
      if (Object.keys(updates).length > 0) {
        const mergedGuest = { ...survivor, ...updates };
        if (updates.firstName || updates.lastName) {
          mergedGuest.displayName = `${mergedGuest.firstName} ${mergedGuest.lastName}`;
        }
        store.updateGuest(survivor.id, updates);
      }

      // Transfer relationship memberships from duplicates to survivor
      for (const dup of duplicates) {
        const dupMemberships = ctx.memberships.filter((m) => m.guestId === dup.id);
        for (const m of dupMemberships) {
          // Only transfer if survivor doesn't already have this group membership
          const survivorHasGroup = ctx.memberships.some(
            (sm) => sm.guestId === survivor.id && sm.groupId === m.groupId,
          );
          if (!survivorHasGroup) {
            store.addRelationshipMembership({
              ...m,
              id: `rm-${crypto.randomUUID()}`,
              guestId: survivor.id,
            });
          }
        }
      }

      // Transfer seating assignments from duplicates to survivor
      for (const dup of duplicates) {
        const dupAssignments = ctx.assignments.filter((a) => a.guestId === dup.id);
        for (const a of dupAssignments) {
          // Only transfer if survivor isn't already seated
          const survivorSeated = ctx.assignments.some(
            (sa) => sa.guestId === survivor.id,
          );
          if (!survivorSeated) {
            store.addSeatingAssignment({
              ...a,
              id: `sa-${crypto.randomUUID()}`,
              guestId: survivor.id,
            });
          }
        }
      }

      // Remove duplicates
      for (const dup of duplicates) {
        store.removeGuest(dup.id);
        removed++;
      }

      merged++;
      mergeLog.push(
        `Merged "${cluster.key}": kept ${survivor.id} (${survivor.displayName}), removed ${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'}`,
      );
    }

    return json({
      summary: `Merged ${merged} duplicate group${merged === 1 ? '' : 's'}, removed ${removed} redundant record${removed === 1 ? '' : 's'}. ${ctx.guests.length - removed} guests remain.`,
      merged,
      removed,
      remainingGuests: ctx.guests.length - removed,
      log: mergeLog,
    });
  }

  return errorResult(`Unknown action "${action}". Use "scan" (default) or "merge".`);
}

// ---------------------------------------------------------------------------
// SEND GUEST EMAIL tool
// ---------------------------------------------------------------------------

function sendGuestEmailTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  // Accept guestId (single) or guestIds (array)
  let guestIds: string[] = [];
  if (Array.isArray(input.guestIds)) {
    guestIds = input.guestIds as string[];
  } else if (typeof input.guestId === 'string') {
    guestIds = [input.guestId];
  }

  if (guestIds.length === 0) {
    return errorResult("Either 'guestId' or 'guestIds' is required.");
  }

  const templateType = (input.templateType as string) ?? 'custom';
  const customSubject = input.customSubject as string | undefined;
  const customBody = input.customBody as string | undefined;

  // Resolve guests
  const resolvedGuests = guestIds
    .map((id) => ctx.guests.find((g) => g.id === id))
    .filter((g): g is Guest => g != null);

  if (resolvedGuests.length === 0) {
    return errorResult('No valid guests found for the provided IDs.');
  }

  // Generate subject and body from template if not custom
  let subject = customSubject ?? '';
  let body = customBody ?? '';

  if (!customSubject || !customBody) {
    const templates = getDefaultCommTemplates();
    const template = templates.find((t) => t.type === templateType) ?? templates[0];
    if (template && resolvedGuests.length > 0) {
      const rendered = renderTemplate(template, resolvedGuests[0], ctx.event);
      if (!customSubject) subject = rendered.subject;
      if (!customBody) body = rendered.body;
    }
  }

  // Create sent message via messaging store
  const store = useEventStore.getState();
  const now = new Date().toISOString();
  const messageId = `gm-${crypto.randomUUID()}`;

  const deliveryResults: DeliveryResult[] = resolvedGuests.map((g) => ({
    guestId: g.id,
    status: 'sent' as const,
    sentAt: now,
  }));

  const guestMessage: GuestMessage = {
    id: messageId,
    orgId: ctx.event.orgId,
    eventId,
    senderId: 'franck-agent',
    senderName: 'Franck Eggelhoffer',
    recipientGuestIds: resolvedGuests.map((g) => g.id),
    subject,
    content: body,
    sentAt: now,
    status: 'sent',
    deliveryResults,
    isNote: false,
    createdAt: now,
  };

  store.addGuestMessage(guestMessage);

  const recipientNames = resolvedGuests.map((g) => g.displayName);
  return json({
    summary: `Sent "${subject}" email to ${resolvedGuests.length} guest${resolvedGuests.length === 1 ? '' : 's'}: ${recipientNames.slice(0, 5).join(', ')}${recipientNames.length > 5 ? ` and ${recipientNames.length - 5} more` : ''}`,
    sent: true,
    messageId,
    templateType,
    recipientCount: resolvedGuests.length,
    recipientNames: recipientNames.slice(0, 20),
    subject,
  });
}

// ---------------------------------------------------------------------------
// EXPORT GUEST LIST tool
// ---------------------------------------------------------------------------

function exportGuestListTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const filter = (input.filter as string) ?? 'all';
  const format = (input.format as string) ?? 'summary';

  // Apply filter
  let filtered = ctx.guests;
  const filterLower = filter.toLowerCase();

  if (filterLower.startsWith('category:')) {
    const cat = normalizeCategory(filterLower.replace('category:', '').trim());
    filtered = filtered.filter((g) => g.category === cat);
  } else if (filterLower.startsWith('rsvp:') || filterLower.startsWith('rsvpstatus:')) {
    const rsvp = normalizeRsvp(filterLower.replace(/^(rsvp|rsvpstatus):/, '').trim());
    filtered = filtered.filter((g) => g.rsvpStatus === rsvp);
  } else if (filterLower === 'seated') {
    const seatedIds = new Set(ctx.assignments.map((a) => a.guestId));
    filtered = filtered.filter((g) => seatedIds.has(g.id));
  } else if (filterLower === 'unseated') {
    const seatedIds = new Set(ctx.assignments.map((a) => a.guestId));
    filtered = filtered.filter((g) => !seatedIds.has(g.id));
  }
  // else 'all' — no filter

  if (filtered.length === 0) {
    return json({
      summary: `No guests match filter "${filter}".`,
      text: 'No guests found.',
      count: 0,
    });
  }

  let text = '';

  if (format === 'summary') {
    text = `GUEST LIST — ${ctx.event.name} (${filtered.length} guests)\n`;
    text += '='.repeat(50) + '\n\n';
    for (const g of filtered) {
      const assignment = ctx.assignments.find((a) => a.guestId === g.id);
      const table = assignment ? ctx.tables.find((t) => t.id === assignment.tableId) : null;
      const tableLabel = table ? (table.tableNumber != null ? `Table ${table.tableNumber}` : table.name) : 'Unseated';
      text += `${g.displayName} | ${g.category} | ${g.rsvpStatus} | ${tableLabel}\n`;
    }
  } else if (format === 'detailed') {
    text = `DETAILED GUEST LIST — ${ctx.event.name} (${filtered.length} guests)\n`;
    text += '='.repeat(60) + '\n\n';
    for (const g of filtered) {
      const assignment = ctx.assignments.find((a) => a.guestId === g.id);
      const table = assignment ? ctx.tables.find((t) => t.id === assignment.tableId) : null;
      const tableLabel = table ? (table.tableNumber != null ? `Table ${table.tableNumber}` : table.name) : 'Unseated';
      text += `${g.displayName}\n`;
      text += `  Category: ${g.category} | RSVP: ${g.rsvpStatus} | Party: ${g.partySize}\n`;
      if (g.email) text += `  Email: ${g.email}\n`;
      if (g.organization) text += `  Org: ${g.organization}\n`;
      if (g.dietaryRestrictions) text += `  Dietary: ${g.dietaryRestrictions}\n`;
      if (g.accessibilityNeeds) text += `  Accessibility: ${g.accessibilityNeeds}\n`;
      text += `  Seating: ${tableLabel}\n`;
      text += '\n';
    }
  } else if (format === 'table-assignments') {
    text = `TABLE ASSIGNMENTS — ${ctx.event.name}\n`;
    text += '='.repeat(50) + '\n\n';

    // Group guests by table
    const tableMap = new Map<string, { label: string; guests: string[] }>();
    const unseated: string[] = [];

    for (const g of filtered) {
      const assignment = ctx.assignments.find((a) => a.guestId === g.id);
      if (assignment) {
        const table = ctx.tables.find((t) => t.id === assignment.tableId);
        const tableKey = assignment.tableId;
        const tableLabel = table ? (table.tableNumber != null ? `Table ${table.tableNumber}` : table.name) : 'Unknown Table';
        if (!tableMap.has(tableKey)) tableMap.set(tableKey, { label: tableLabel, guests: [] });
        tableMap.get(tableKey)!.guests.push(g.displayName);
      } else {
        unseated.push(g.displayName);
      }
    }

    for (const [, { label, guests }] of tableMap) {
      text += `${label} (${guests.length} guests):\n`;
      for (const name of guests) {
        text += `  - ${name}\n`;
      }
      text += '\n';
    }

    if (unseated.length > 0) {
      text += `UNSEATED (${unseated.length}):\n`;
      for (const name of unseated) {
        text += `  - ${name}\n`;
      }
    }
  } else {
    return errorResult(`Unknown format "${format}". Use "summary", "detailed", or "table-assignments".`);
  }

  return json({
    summary: `Exported ${filtered.length} guests in "${format}" format (filter: ${filter})`,
    count: filtered.length,
    filter,
    format,
    text,
  });
}

// ---------------------------------------------------------------------------
// GET EVENT CHECKLIST tool
// ---------------------------------------------------------------------------

function getEventChecklistTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const { guests, tables, assignments, groups, memberships } = ctx;

  interface ChecklistItem {
    item: string;
    status: 'pass' | 'fail' | 'warning';
    detail: string;
    suggestion?: string;
  }

  const checklist: ChecklistItem[] = [];

  // 1. Has guests?
  if (guests.length === 0) {
    checklist.push({ item: 'Guest list', status: 'fail', detail: '0 guests added', suggestion: 'Add guests using add_guest or import a CSV.' });
  } else {
    checklist.push({ item: 'Guest list', status: 'pass', detail: `${guests.length} guests in the event` });
  }

  // 2. Has tables?
  if (tables.length === 0) {
    checklist.push({ item: 'Tables', status: 'fail', detail: '0 tables created', suggestion: 'Add tables using add_table (e.g. add_table with capacity 8).' });
  } else {
    const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
    checklist.push({ item: 'Tables', status: 'pass', detail: `${tables.length} tables with total capacity ${totalCapacity}` });
  }

  // 3. Has seating?
  if (assignments.length === 0 && guests.length > 0) {
    checklist.push({ item: 'Seating assignments', status: 'fail', detail: 'No guests are seated', suggestion: 'Run auto_seat_guests to seat everyone.' });
  } else if (assignments.length > 0) {
    checklist.push({ item: 'Seating assignments', status: 'pass', detail: `${assignments.length} guests seated` });
  }

  // 4. RSVP response rate
  const responded = guests.filter((g) => g.rsvpStatus !== 'invited').length;
  const responseRate = guests.length > 0 ? Math.round((responded / guests.length) * 100) : 0;
  if (guests.length > 0 && responseRate < 50) {
    checklist.push({ item: 'RSVP response rate', status: 'warning', detail: `${responseRate}% (${responded}/${guests.length})`, suggestion: 'Send RSVP reminders to non-responders using send_guest_email.' });
  } else if (guests.length > 0 && responseRate < 80) {
    checklist.push({ item: 'RSVP response rate', status: 'warning', detail: `${responseRate}% (${responded}/${guests.length})`, suggestion: 'Consider sending reminders to improve response rate.' });
  } else if (guests.length > 0) {
    checklist.push({ item: 'RSVP response rate', status: 'pass', detail: `${responseRate}% (${responded}/${guests.length})` });
  }

  // 5. Dietary info coverage
  const withDietary = guests.filter((g) => g.dietaryRestrictions && g.dietaryRestrictions.trim() !== '').length;
  const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in');
  const confirmedWithoutDietary = confirmed.filter((g) => !g.dietaryRestrictions || g.dietaryRestrictions.trim() === '').length;
  if (confirmed.length > 0 && confirmedWithoutDietary > confirmed.length * 0.5) {
    checklist.push({ item: 'Dietary info', status: 'warning', detail: `${confirmedWithoutDietary} confirmed guests have no dietary info recorded`, suggestion: 'Send a follow-up to gather dietary requirements.' });
  } else {
    checklist.push({ item: 'Dietary info', status: 'pass', detail: `${withDietary} guests have dietary info recorded` });
  }

  // 6. Unseated guests
  const seatedIds = new Set(assignments.map((a) => a.guestId));
  const unseatedConfirmed = guests.filter(
    (g) => (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in') && !seatedIds.has(g.id),
  );
  if (unseatedConfirmed.length > 0) {
    checklist.push({ item: 'Unseated confirmed guests', status: 'fail', detail: `${unseatedConfirmed.length} confirmed guests have no seat`, suggestion: `Run auto_seat_guests to fix ${unseatedConfirmed.length} unseated guests.` });
  } else if (guests.length > 0 && assignments.length > 0) {
    checklist.push({ item: 'Unseated confirmed guests', status: 'pass', detail: 'All confirmed guests are seated' });
  }

  // 7. Capacity check
  if (tables.length > 0 && guests.length > 0) {
    const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
    const confirmedCount = confirmed.length;
    if (totalCapacity < confirmedCount) {
      checklist.push({ item: 'Capacity', status: 'fail', detail: `${totalCapacity} seats for ${confirmedCount} confirmed guests`, suggestion: 'Add more tables or increase table capacities.' });
    } else {
      checklist.push({ item: 'Capacity', status: 'pass', detail: `${totalCapacity} seats for ${confirmedCount} confirmed guests (${totalCapacity - confirmedCount} surplus)` });
    }
  }

  const passCount = checklist.filter((c) => c.status === 'pass').length;
  const failCount = checklist.filter((c) => c.status === 'fail').length;
  const warnCount = checklist.filter((c) => c.status === 'warning').length;

  return json({
    summary: `Event checklist: ${passCount} pass, ${failCount} fail, ${warnCount} warning out of ${checklist.length} items`,
    passCount,
    failCount,
    warningCount: warnCount,
    totalItems: checklist.length,
    checklist,
  });
}

// ---------------------------------------------------------------------------
// SUGGEST NEXT ACTIONS tool
// ---------------------------------------------------------------------------

function suggestNextActionsTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const { guests, tables, assignments, groups } = ctx;

  interface Suggestion {
    priority: number;
    action: string;
    reason: string;
    tool?: string;
  }

  const suggestions: Suggestion[] = [];

  // No guests
  if (guests.length === 0) {
    suggestions.push({ priority: 1, action: 'Add guests to your event', reason: 'Your event has no guests yet.', tool: 'add_guest or add_guests_bulk' });
    return json({
      summary: 'Your event needs guests! Start by adding your guest list.',
      suggestions: suggestions.slice(0, 5),
    });
  }

  // No tables
  if (tables.length === 0) {
    suggestions.push({ priority: 1, action: 'Create tables for your venue', reason: 'No tables exist yet — you need tables before seating guests.', tool: 'add_table' });
  }

  // Low RSVP response rate
  const responded = guests.filter((g) => g.rsvpStatus !== 'invited').length;
  const responseRate = guests.length > 0 ? Math.round((responded / guests.length) * 100) : 0;
  const nonResponders = guests.filter((g) => g.rsvpStatus === 'invited');
  if (responseRate < 60 && nonResponders.length > 0) {
    suggestions.push({ priority: 2, action: `Send RSVP reminders to ${nonResponders.length} non-responders`, reason: `Only ${responseRate}% response rate — many guests haven't replied.`, tool: 'send_guest_email with templateType "rsvp_reminder"' });
  }

  // Many unseated guests
  const seatedIds = new Set(assignments.map((a) => a.guestId));
  const unseatedConfirmed = guests.filter(
    (g) => (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in') && !seatedIds.has(g.id),
  );
  if (unseatedConfirmed.length > 5) {
    suggestions.push({ priority: 2, action: `Seat ${unseatedConfirmed.length} unseated confirmed guests`, reason: 'These guests are confirmed but have no table assignment.', tool: 'auto_seat_guests' });
  } else if (unseatedConfirmed.length > 0) {
    suggestions.push({ priority: 3, action: `Seat ${unseatedConfirmed.length} remaining unseated guest${unseatedConfirmed.length === 1 ? '' : 's'}`, reason: 'A few confirmed guests still need seats.', tool: 'auto_seat_guests or move_guest_to_table' });
  }

  // Seating exists but may need optimization
  if (assignments.length > 10) {
    suggestions.push({ priority: 4, action: 'Run seating optimization', reason: 'Optimize the current arrangement for better relationship satisfaction.', tool: 'run_refinement_loop' });
  }

  // No relationship groups
  if (groups.length === 0 && guests.length > 5) {
    suggestions.push({ priority: 5, action: 'Create relationship groups', reason: 'Defining donor-recipient or family groups helps the seating algorithm place people together.', tool: 'create_relationship_group' });
  }

  // Missing dietary info on confirmed guests
  const confirmedGuests = guests.filter((g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in');
  const confirmedWithoutDietary = confirmedGuests.filter((g) => !g.dietaryRestrictions || g.dietaryRestrictions.trim() === '').length;
  if (confirmedGuests.length > 0 && confirmedWithoutDietary > confirmedGuests.length * 0.5) {
    suggestions.push({ priority: 4, action: `Gather dietary info for ${confirmedWithoutDietary} confirmed guests`, reason: 'More than half of confirmed guests have no dietary information recorded.', tool: 'send_guest_email with templateType "event_update"' });
  }

  // Sort by priority
  suggestions.sort((a, b) => a.priority - b.priority);

  const top = suggestions.slice(0, 5);

  return json({
    summary: `${top.length} suggested next action${top.length === 1 ? '' : 's'} for your event`,
    suggestions: top,
  });
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Layout manipulation tools — move, arrange, fix, align tables
// ---------------------------------------------------------------------------

function moveTableTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const tableNumber = input.tableNumber as number | undefined;
  let tableId = input.tableId as string | undefined;

  if (!tableId && tableNumber != null) {
    const found = ctx.tables.find((t) => t.tableNumber === tableNumber);
    if (found) tableId = found.id;
  }

  if (!tableId) return errorResult('Provide tableId or tableNumber to identify the table.');

  const table = ctx.tables.find((t) => t.id === tableId);
  if (!table) return errorResult(`Table not found.`);

  const x = input.x as number | undefined;
  const y = input.y as number | undefined;

  if (x === undefined && y === undefined) return errorResult('Provide x and/or y coordinates.');

  const store = useEventStore.getState();
  const updates: Partial<LayoutObject> = {};
  if (x !== undefined) updates.x = Math.round(x);
  if (y !== undefined) updates.y = Math.round(y);
  store.updateLayoutObject(tableId, updates);

  const name = table.tableNumber != null ? `Table ${table.tableNumber}` : table.name;
  return json({
    summary: `Moved ${name} to (${updates.x ?? table.x}, ${updates.y ?? table.y})`,
    tableId,
    name,
    x: updates.x ?? table.x,
    y: updates.y ?? table.y,
  });
}

function arrangeTablesTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.tables.length === 0) return errorResult('No tables in the layout to arrange.');

  const pattern = (input.pattern as string) ?? 'grid';
  const PAD = 8;
  const store = useEventStore.getState();

  // Detect tents — if a tent exists, arrange tables INSIDE the tent
  const tents = ctx.allObjects.filter((o) => o.type === 'tent');
  let boundsX = 0;
  let boundsY = 0;
  let boundsWidth = ctx.activeVersion?.canvasWidth ?? 1200;
  let boundsHeight = ctx.activeVersion?.canvasHeight ?? 800;
  let insideTent: LayoutObject | null = null;

  if (tents.length > 0) {
    const largest = tents.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
    boundsX = largest.x + PAD;
    boundsY = largest.y + PAD;
    boundsWidth = largest.width - PAD * 2;
    boundsHeight = largest.height - PAD * 2;
    insideTent = largest;
  }

  // Filter to specific tables if tableNumbers provided, otherwise all tables
  const tableNumbers = input.tableNumbers as number[] | undefined;
  let tablesToArrange = ctx.tables;
  if (tableNumbers && tableNumbers.length > 0) {
    tablesToArrange = ctx.tables.filter((t) => t.tableNumber != null && tableNumbers.includes(t.tableNumber));
    if (tablesToArrange.length === 0) return errorResult('None of the specified table numbers were found.');
  }

  // STEP 1: Compute table size that FITS the bounds
  // Don't hardcode — calculate from tent size and table count
  const n = tablesToArrange.length;
  let cols = input.columns as number | undefined;

  // First pass: determine columns from requested or best-fit
  if (!cols) {
    // Try column counts, pick best aspect ratio match
    let bestCols = 1;
    let bestScore = Infinity;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const aspectGrid = c / r;
      const aspectBounds = boundsWidth / boundsHeight;
      const score = Math.abs(aspectGrid - aspectBounds);
      if (score < bestScore) {
        bestScore = score;
        bestCols = c;
      }
    }
    cols = bestCols;
  }

  const rows = Math.ceil(n / cols);

  // Calculate the max table size that fits all tables with at least 5px spacing
  const minSpacing = 5;
  const maxTableW = Math.floor((boundsWidth - (cols + 1) * minSpacing) / cols);
  const maxTableH = Math.floor((boundsHeight - (rows + 1) * minSpacing) / rows);
  // Keep tables square for round tables, use the smaller dimension
  const isAllRect = tablesToArrange.every((t) => t.type === 'rect_table');
  let uniformW: number;
  let uniformH: number;

  if (isAllRect) {
    // Rect tables: 3:1 aspect ratio
    uniformW = Math.min(maxTableW, maxTableH * 3);
    uniformH = Math.floor(uniformW / 3);
  } else {
    // Round/square tables: equal w/h
    const maxDim = Math.min(maxTableW, maxTableH);
    // Cap at 80px (don't make tables absurdly large either)
    uniformW = Math.min(maxDim, 80);
    uniformH = uniformW;
  }

  // Minimum table size of 25px so they're still visible
  uniformW = Math.max(25, uniformW);
  uniformH = Math.max(25, uniformH);

  // Force every table to the computed size
  for (const t of tablesToArrange) {
    store.updateLayoutObject(t.id, { width: uniformW, height: uniformH });
  }

  // STEP 2: Calculate spacing from remaining space
  const spacingX = cols > 1
    ? Math.max(3, Math.floor((boundsWidth - cols * uniformW) / (cols + 1)))
    : 0;
  const spacingY = rows > 1
    ? Math.max(3, Math.floor((boundsHeight - rows * uniformH) / (rows + 1)))
    : 0;
  // Use the smaller of the two for uniform look, capped reasonably
  const spacing = Math.min(spacingX, spacingY, 40);

  // STEP 3: Compute positions directly (don't rely on arrangement engine for critical path)
  // This gives us full control and avoids any centering/margin surprises
  const gridTotalW = cols * uniformW + (cols - 1) * spacing;
  const gridTotalH = rows * uniformH + (rows - 1) * spacing;
  const startX = boundsX + Math.max(0, (boundsWidth - gridTotalW) / 2);
  const startY = boundsY + Math.max(0, (boundsHeight - gridTotalH) / 2);

  let results: { id: string; x: number; y: number }[];

  if (pattern === 'circle') {
    // Circle layout uses the arrangement engine
    const objects: ArrangeableObject[] = tablesToArrange.map((t) => ({
      id: t.id, x: t.x, y: t.y, width: uniformW, height: uniformH,
    }));
    results = arrangeCircle(objects, {
      centerX: boundsWidth / 2,
      centerY: boundsHeight / 2,
      radius: input.radius as number | undefined,
    });
    // Offset to tent origin
    for (const r of results) { r.x += boundsX; r.y += boundsY; }
  } else {
    // Grid and rows: compute directly for maximum control
    results = tablesToArrange.map((t, i) => {
      const col = i % cols!;
      const row = Math.floor(i / cols!);
      let x = startX + col * (uniformW + spacing);
      let y = startY + row * (uniformH + spacing);

      // Stagger for rows pattern
      if (pattern === 'rows' && (input.stagger as boolean) && row % 2 === 1) {
        x += (uniformW + spacing) / 2;
      }

      return { id: t.id, x, y };
    });
  }

  // STEP 4: Hard clamp — nothing escapes the tent, period
  for (const r of results) {
    r.x = Math.max(boundsX, Math.min(boundsX + boundsWidth - uniformW, r.x));
    r.y = Math.max(boundsY, Math.min(boundsY + boundsHeight - uniformH, r.y));
  }

  // STEP 5: Apply position updates
  const moved: string[] = [];
  for (const r of results) {
    store.updateLayoutObject(r.id, { x: Math.round(r.x), y: Math.round(r.y) });
    const table = tablesToArrange.find((t) => t.id === r.id);
    if (table) {
      moved.push(table.tableNumber != null ? `Table ${table.tableNumber}` : table.name);
    }
  }

  const boundsDesc = insideTent
    ? `inside tent "${insideTent.name}" (${Math.round(insideTent.width)}×${Math.round(insideTent.height)}px)`
    : `on canvas (${boundsWidth}×${boundsHeight}px)`;

  return json({
    summary: `Arranged ${moved.length} tables in ${pattern} pattern (${cols} cols × ${rows} rows, ${spacing}px spacing, uniform ${uniformW}×${uniformH}px tables) ${boundsDesc}`,
    pattern,
    columns: cols,
    rows,
    spacing,
    tableSize: { width: uniformW, height: uniformH },
    tablesArranged: moved.length,
    bounds: boundsDesc,
  });
}

function fixLayoutIssuesTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  if (ctx.tables.length === 0) return errorResult('No tables in the layout.');

  // Use tent bounds if a tent exists, otherwise canvas bounds
  const tents = ctx.allObjects.filter((o) => o.type === 'tent');
  let boundsX = 0;
  let boundsY = 0;
  let boundsRight = ctx.activeVersion?.canvasWidth ?? 1200;
  let boundsBottom = ctx.activeVersion?.canvasHeight ?? 800;
  const EDGE_MARGIN = 15;

  if (tents.length > 0) {
    const largest = tents.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b));
    boundsX = largest.x + EDGE_MARGIN;
    boundsY = largest.y + EDGE_MARGIN;
    boundsRight = largest.x + largest.width - EDGE_MARGIN;
    boundsBottom = largest.y + largest.height - EDGE_MARGIN;
  }

  const MIN_SPACING = 100;
  const store = useEventStore.getState();

  const fixes: string[] = [];

  // 1. Fix out-of-bounds tables — push them inside bounds (tent or canvas)
  for (const t of ctx.tables) {
    let x = t.x;
    let y = t.y;
    let moved = false;
    if (x < boundsX) { x = boundsX; moved = true; }
    if (y < boundsY) { y = boundsY; moved = true; }
    if (x + t.width > boundsRight) { x = boundsRight - t.width; moved = true; }
    if (y + t.height > boundsBottom) { y = boundsBottom - t.height; moved = true; }
    if (moved) {
      store.updateLayoutObject(t.id, { x: Math.round(x), y: Math.round(y) });
      const name = t.tableNumber != null ? `Table ${t.tableNumber}` : t.name;
      fixes.push(`Moved ${name} inside bounds`);
    }
  }

  // 2. Fix overlapping/too-close tables — push apart iteratively
  // Use simple repulsion: for each pair that's too close, push them apart along the vector between centers
  const positions = new Map(ctx.tables.map((t) => [t.id, { x: t.x, y: t.y, w: t.width, h: t.height }]));

  // Update positions from step 1
  for (const t of ctx.tables) {
    const p = positions.get(t.id)!;
    // Re-read from store in case we already moved it
    const current = store.layoutObjects.find((o) => o.id === t.id);
    if (current) { p.x = current.x; p.y = current.y; }
  }

  // Run 5 iterations of repulsion
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < ctx.tables.length; i++) {
      for (let j = i + 1; j < ctx.tables.length; j++) {
        const a = positions.get(ctx.tables[i].id)!;
        const b = positions.get(ctx.tables[j].id)!;
        const cx1 = a.x + a.w / 2;
        const cy1 = a.y + a.h / 2;
        const cx2 = b.x + b.w / 2;
        const cy2 = b.y + b.h / 2;
        const dx = cx2 - cx1;
        const dy = cy2 - cy1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MIN_SPACING && dist > 0) {
          const push = (MIN_SPACING - dist) / 2 + 5;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  // Apply repulsion results
  let spacingFixes = 0;
  for (const t of ctx.tables) {
    const p = positions.get(t.id)!;
    const orig = store.layoutObjects.find((o) => o.id === t.id);
    if (orig && (Math.abs(orig.x - p.x) > 1 || Math.abs(orig.y - p.y) > 1)) {
      // Clamp to bounds (tent or canvas)
      const x = Math.max(boundsX, Math.min(boundsRight - p.w, p.x));
      const y = Math.max(boundsY, Math.min(boundsBottom - p.h, p.y));
      store.updateLayoutObject(t.id, { x: Math.round(x), y: Math.round(y) });
      spacingFixes++;
    }
  }
  if (spacingFixes > 0) {
    fixes.push(`Fixed spacing on ${spacingFixes} tables (pushed apart to ${MIN_SPACING}px minimum)`);
  }

  if (fixes.length === 0) {
    return json({ summary: 'No layout issues found — everything looks clean!', fixesApplied: 0 });
  }

  return json({
    summary: `Fixed ${fixes.length} layout issues: ${fixes.join('; ')}`,
    fixesApplied: fixes.length,
    details: fixes,
  });
}

function alignTablesTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return eventNotFoundError(eventId);

  const action = (input.action as string) ?? 'align';
  const edge = input.edge as string | undefined;
  const axis = input.axis as string | undefined;

  // Filter to specific tables if tableNumbers provided
  const tableNumbers = input.tableNumbers as number[] | undefined;
  let tablesToProcess = ctx.tables;
  if (tableNumbers && tableNumbers.length > 0) {
    tablesToProcess = ctx.tables.filter((t) => t.tableNumber != null && tableNumbers.includes(t.tableNumber));
    if (tablesToProcess.length === 0) return errorResult('None of the specified table numbers were found.');
  }

  if (tablesToProcess.length < 2) return errorResult('Need at least 2 tables to align or distribute.');

  const objects: ArrangeableObject[] = tablesToProcess.map((t) => ({
    id: t.id, x: t.x, y: t.y, width: t.width, height: t.height,
  }));

  let results: { id: string; x: number; y: number }[];

  if (action === 'distribute') {
    const distAxis = (axis === 'vertical' ? 'vertical' : 'horizontal') as 'horizontal' | 'vertical';
    results = distributeEqual(objects, distAxis);
  } else {
    // align
    const validEdges = ['left', 'right', 'top', 'bottom', 'centerH', 'centerV'] as const;
    const alignEdge = (edge && validEdges.includes(edge as any)) ? edge as typeof validEdges[number] : 'left';
    results = alignObjects(objects, alignEdge);
  }

  const store = useEventStore.getState();
  for (const r of results) {
    store.updateLayoutObject(r.id, { x: Math.round(r.x), y: Math.round(r.y) });
  }

  const names = tablesToProcess.map((t) => t.tableNumber != null ? `Table ${t.tableNumber}` : t.name);
  const desc = action === 'distribute'
    ? `Distributed ${names.length} tables equally (${axis ?? 'horizontal'})`
    : `Aligned ${names.length} tables to ${edge ?? 'left'}`;

  return json({
    summary: desc,
    action,
    tablesAffected: names.length,
    tables: names,
  });
}

function importBlackbaudTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  // Check if Blackbaud config exists in localStorage
  const configStr = typeof window !== 'undefined' ? localStorage.getItem('blackbaud-config') : null;
  if (!configStr) {
    return json({
      error: true,
      message: 'Blackbaud is not connected yet. Ask the user to go to Integrations and set up the Blackbaud connection first.',
      suggestion: 'Navigate to the Integrations page and click "Connect" on Blackbaud Award Management to enter their SKY API credentials.',
    });
  }

  // Config exists — tell Franck what's available
  return json({
    summary: 'Blackbaud Award Management is connected. To import scholarship data, the user should use the Import dialog on the Integrations page. Franck can guide them there.',
    connected: true,
    suggestion: 'Tell the user to go to Integrations → Blackbaud Award Management → Import to pull in scholarship recipients, donors, and award data automatically.',
  });
}

const TOOL_MAP: Record<
  string,
  (state: StoreState, eventId: string, input: ToolInput) => string | Promise<string>
> = {
  // Event management
  create_event: createEventTool,
  update_event: updateEventTool,
  list_events: listEventsTool,
  // Guest add
  add_guest: addGuestTool,
  add_guests_bulk: addGuestsBulkTool,
  // Layout / table management
  add_table: addTableTool,
  remove_table: removeTableTool,
  update_table: updateTableTool,
  move_table: moveTableTool,
  arrange_tables: arrangeTablesTool,
  fix_layout_issues: fixLayoutIssuesTool,
  align_tables: alignTablesTool,
  // Relationship management
  create_relationship_group: createRelationshipGroupTool,
  add_to_relationship_group: addToRelationshipGroupTool,
  list_relationship_groups: listRelationshipGroupsTool,
  // Version management
  list_versions: listVersionsTool,
  create_version: createVersionTool,
  // Existing tools
  get_event_summary: getEventSummary,
  analyze_guest_list: analyzeGuestList,
  search_guests: searchGuests,
  list_guests: listGuests,
  get_guest_details: getGuestDetails,
  auto_seat_guests: autoSeatGuests,
  score_seating: scoreSeating,
  get_seating_recommendations: getSeatingRecommendationsTool,
  get_table_info: getTableInfo,
  generate_email_draft: generateEmailDraft,
  flag_issues: flagIssues,
  get_attendance_projection: getAttendanceProjection,
  analyze_dietary_needs: analyzeDietaryNeedsTool,
  get_rsvp_summary: getRsvpSummaryTool,
  update_guest: updateGuestTool,
  delete_guests: deleteGuestsTool,
  deduplicate_guests: deduplicateGuestsTool,
  bulk_update_guests: bulkUpdateGuestsTool,
  move_guest_to_table: moveGuestToTableTool,
  swap_guests: swapGuestsTool,
  unseat_guest: unseatGuestTool,
  clear_all_seating: clearAllSeatingTool,
  run_refinement_loop: runRefinementLoopTool,
  analyze_layout: analyzeLayoutTool,
  send_guest_email: sendGuestEmailTool,
  export_guest_list: exportGuestListTool,
  get_event_checklist: getEventChecklistTool,
  suggest_next_actions: suggestNextActionsTool,
  import_blackbaud: importBlackbaudTool,
};

/**
 * Execute a named tool against the current store state.
 *
 * @param name       - The tool name (e.g. "get_event_summary")
 * @param input      - Tool-specific parameters from the AI agent
 * @param storeState - A snapshot of the Zustand store state
 * @param eventId    - The active event ID
 * @returns A JSON string with the tool result
 */
export async function executeTool(
  name: string,
  input: ToolInput,
  storeState: StoreState,
  eventId: string,
): Promise<string> {
  const handler = TOOL_MAP[name];
  if (!handler) {
    return errorResult(
      `Unknown tool "${name}". Available tools: ${Object.keys(TOOL_MAP).join(', ')}`,
    );
  }
  try {
    return await handler(storeState, eventId, input);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    return errorResult(`Tool "${name}" failed: ${message}`);
  }
}

/**
 * Takes a tool name and its JSON result string and returns a one-line
 * human-readable summary. Usable by workflow and chain formatters.
 */
export function summarizeToolResult(toolName: string, result: string): string {
  try {
    const data = JSON.parse(result);

    // If the result already has a summary field, use it directly.
    if (typeof data.summary === 'string') {
      return data.summary;
    }

    // Error results
    if (data.error) {
      return `Error: ${data.message ?? 'unknown error'}`;
    }

    // Fallback summaries per tool name
    switch (toolName) {
      case 'get_event_summary':
        return `${data.name ?? 'Event'}: ${data.guestCount ?? 0} guests, ${data.confirmedCount ?? 0} confirmed`;
      case 'analyze_guest_list':
        return `${data.totalFiltered ?? 0} guests analyzed, ${data.analytics?.confirmationRate ?? 0}% confirmation rate`;
      case 'search_guests':
        return `Found ${data.resultCount ?? 0} guest${(data.resultCount ?? 0) === 1 ? '' : 's'} matching '${data.query ?? ''}'`;
      case 'get_guest_details':
        return `Details for ${data.guest?.displayName ?? 'unknown guest'}`;
      case 'auto_seat_guests':
        return `Seated ${data.applied ?? 0} guests`;
      case 'score_seating':
        return `Seating score: ${data.score?.overall ?? '?'}/100`;
      case 'get_seating_recommendations':
        return `${data.totalRecommendations ?? 0} recommendations`;
      case 'get_table_info':
        return `${data.totalTables ?? 0} tables, ${data.seatedGuests ?? 0} seated`;
      case 'generate_email_draft':
        return `Email draft for ${data.guestName ?? 'guest'}`;
      case 'flag_issues':
        return `${data.issueCount ?? 0} issues, health ${data.healthScore ?? '?'}/100`;
      case 'move_guest_to_table':
        return `Moved ${data.guestName ?? 'guest'} to ${data.tableName ?? 'table'}`;
      case 'swap_guests':
        return `Swapped ${data.guest1?.name ?? 'guest1'} and ${data.guest2?.name ?? 'guest2'}`;
      case 'clear_all_seating':
        return `Cleared ${data.cleared ?? 0} assignments`;
      case 'add_table':
        return `Added ${data.name ?? 'table'} (capacity ${data.capacity ?? '?'})`;
      case 'remove_table':
        return `Removed ${data.tableName ?? 'table'}`;
      case 'add_guest':
        return `Added ${data.displayName ?? 'guest'}`;
      case 'add_guests_bulk':
        return `Added ${data.added ?? 0} guests`;
      case 'create_event':
        return `Created event '${data.name ?? ''}'`;
      case 'update_event':
        return `Updated event fields: ${(data.fieldsChanged ?? []).join(', ')}`;
      case 'list_events':
        return `${data.count ?? 0} events`;
      case 'update_guest':
        return `Updated ${data.guestName ?? 'guest'}`;
      case 'delete_guests':
        return `Deleted ${data.deleted ?? 0} guests`;
      case 'bulk_update_guests':
        return `Bulk-updated ${data.updated ?? 0} guests`;
      case 'unseat_guest':
        return `Unseated ${data.guestName ?? 'guest'}`;
      case 'run_refinement_loop':
        return `Refinement: ${data.initialScore ?? '?'} -> ${data.finalScore ?? '?'} (${data.iterations ?? 0} iterations)`;
      case 'create_relationship_group':
        return `Created group '${data.name ?? ''}'`;
      case 'add_to_relationship_group':
        return `Added ${data.guestName ?? 'guest'} to '${data.groupName ?? 'group'}'`;
      case 'list_relationship_groups':
        return `${data.count ?? 0} relationship groups`;
      case 'list_versions':
        return `${data.count ?? 0} versions`;
      case 'create_version':
        return `Created version '${data.name ?? ''}'`;
      case 'get_attendance_projection':
        return `Projected attendance: ${data.projection?.expected ?? '?'}`;
      case 'analyze_dietary_needs':
        return `${data.totalWithRestrictions ?? 0} guests with dietary restrictions`;
      case 'update_table':
        return `Updated table: ${(data.fieldsChanged ?? []).join(', ')}`;
      case 'send_guest_email':
        return `Sent email to ${data.recipientCount ?? 0} guest${(data.recipientCount ?? 0) === 1 ? '' : 's'}`;
      case 'export_guest_list':
        return `Exported ${data.count ?? 0} guests (${data.format ?? 'summary'})`;
      case 'get_event_checklist':
        return `Checklist: ${data.passCount ?? 0} pass, ${data.failCount ?? 0} fail, ${data.warningCount ?? 0} warning`;
      case 'suggest_next_actions':
        return `${data.suggestions?.length ?? 0} suggested actions`;
      default:
        return `${toolName} completed`;
    }
  } catch {
    return `${toolName} completed (could not parse result)`;
  }
}
