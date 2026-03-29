/**
 * Franck Eggelhoffer AI Agent — Tool Execution Layer
 *
 * Maps tool names to implementations that read from the Zustand store state
 * and delegate to the existing pure-function service libraries. Every tool
 * returns a JSON string suitable for inclusion in an LLM conversation.
 */

import { useEventStore } from '@/data/store';

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
    ]
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
        seating: table
          ? { tableId: table.id, tableNumber: table.tableNumber ?? null, tableName: table.name }
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

  const proposal = generateSeatingProposal({
    tables: ctx.tables,
    guests: ctx.guests,
    existingAssignments: ctx.assignments,
    relationshipGroups: ctx.groups,
    relationshipMemberships: ctx.memberships,
    versionId: ctx.versionId,
  });

  // Apply the assignments to the store
  const store = useEventStore.getState();
  let applied = 0;
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
    } catch {
      // Skip individual failures, continue seating others
    }
  }

  return json({
    applied,
    totalProposed: proposal.assignments.length,
    assignments: proposal.assignments.map((a) => {
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
    summary: `Seated ${applied} guest${applied === 1 ? '' : 's'} across ${proposal.summary.tablesUsed} table${proposal.summary.tablesUsed === 1 ? '' : 's'}. Assignments are now live.`,
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
  _input: ToolInput,
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
    tables: seatingAnalytics.tableUtilization.map((t) => ({
      tableId: t.table.id,
      tableNumber: t.table.tableNumber ?? null,
      tableName: t.table.name,
      type: t.table.type,
      capacity: t.capacity,
      seated: t.seated,
      utilizationPct: t.utilizationPct,
      hasAnchor: t.hasAnchor,
      anchorGroupName: t.anchorGroupName ?? null,
    })),
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

  if (input.rsvpStatus !== undefined) updates.rsvpStatus = input.rsvpStatus as Guest['rsvpStatus'];
  if (input.category !== undefined) updates.category = input.category as Guest['category'];
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

  if (input.rsvpStatus !== undefined) updates.rsvpStatus = input.rsvpStatus as Guest['rsvpStatus'];
  if (input.category !== undefined) updates.category = input.category as Guest['category'];
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
      targets = ctx.guests.filter((g) => g.category === cat).map((g) => g.id);
    } else if (filterLower.startsWith('rsvp:')) {
      const rsvp = filterLower.replace('rsvp:', '').trim();
      targets = ctx.guests.filter((g) => g.rsvpStatus === rsvp).map((g) => g.id);
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

  const reqErr = validateRequired(input, 'guestId');
  if (reqErr) return errorResult(reqErr);

  const guestId = input.guestId as string;
  let tableId = input.tableId as string | undefined;
  const tableNumber = input.tableNumber as number | undefined;

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
    return errorResult('No seating assignments to clear.');
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
    category: (input.category as GuestCategory) ?? 'other',
    rsvpStatus: (input.rsvpStatus as RSVPStatus) ?? 'invited',
    partySize: (input.partySize as number) ?? 1,
    dietaryRestrictions: (input.dietaryRestrictions as string) ?? '',
    accessibilityNeeds: (input.accessibilityNeeds as string) ?? '',
    notes: (input.notes as string) ?? '',
    relationshipTags: [],
    tablePreference: '',
    seatingPreference: '',
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

  for (const g of guestsInput) {
    const firstName = g.firstName as string | undefined;
    const lastName = g.lastName as string | undefined;
    if (!firstName || !lastName) continue;

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
      category: (g.category as GuestCategory) ?? 'other',
      rsvpStatus: (g.rsvpStatus as RSVPStatus) ?? 'invited',
      partySize: (g.partySize as number) ?? 1,
      dietaryRestrictions: (g.dietaryRestrictions as string) ?? '',
      accessibilityNeeds: (g.accessibilityNeeds as string) ?? '',
      notes: (g.notes as string) ?? '',
      relationshipTags: [],
      tablePreference: '',
      seatingPreference: '',
    };

    store.addGuest(guest);
    added.push({ guestId, displayName: guest.displayName });
  }

  const skipped = guestsInput.length - added.length;
  return json({
    summary: `Added ${added.length} guest${added.length === 1 ? '' : 's'}${skipped > 0 ? `, skipped ${skipped} (missing name)` : ''}`,
    added: added.length,
    skipped,
    guests: added,
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
// Tool dispatcher
// ---------------------------------------------------------------------------

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
  get_guest_details: getGuestDetails,
  auto_seat_guests: autoSeatGuests,
  score_seating: scoreSeating,
  get_seating_recommendations: getSeatingRecommendationsTool,
  get_table_info: getTableInfo,
  generate_email_draft: generateEmailDraft,
  flag_issues: flagIssues,
  get_attendance_projection: getAttendanceProjection,
  analyze_dietary_needs: analyzeDietaryNeedsTool,
  update_guest: updateGuestTool,
  delete_guests: deleteGuestsTool,
  bulk_update_guests: bulkUpdateGuestsTool,
  move_guest_to_table: moveGuestToTableTool,
  swap_guests: swapGuestsTool,
  unseat_guest: unseatGuestTool,
  clear_all_seating: clearAllSeatingTool,
  run_refinement_loop: runRefinementLoopTool,
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
      default:
        return `${toolName} completed`;
    }
  } catch {
    return `${toolName} completed (could not parse result)`;
  }
}
