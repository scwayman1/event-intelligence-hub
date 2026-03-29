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

import type { GuestCategory, RSVPStatus } from '@/types/events';

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

/** Look up the event and its associated data from the store snapshot. */
function getEventContext(state: StoreState, eventId: string) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return null;

  const guests = state.guests.filter((g) => g.eventId === eventId);
  const versions = state.versions.filter((v) => v.eventId === eventId);
  const activeVersion = versions.find((v) => v.id === event.activeVersionId);
  const versionId = activeVersion?.id ?? event.activeVersionId;
  const tables = state.layoutObjects.filter((o) => o.versionId === versionId);
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const { event, guests, tables, assignments, versions } = ctx;
  const health = computeEventHealth(event, guests, tables, assignments, versions);
  const guestAnalytics = analyzeGuests(guests, eventId);

  return json({
    eventId: event.id,
    name: event.name,
    type: event.type,
    status: event.status,
    date: event.date,
    time: event.time,
    venue: event.venue,
    venueAddress: event.venueAddress,
    guestCount: guestAnalytics.total,
    confirmedCount:
      guestAnalytics.byStatus.confirmed + guestAnalytics.byStatus.checked_in,
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

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

  return json({
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const query = (input.query as string | undefined) ?? '';
  if (!query.trim()) {
    return errorResult('A search query is required.');
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

  return json({
    query,
    resultCount: matches.length,
    results: matches.map((g) => ({
      id: g.id,
      displayName: g.displayName,
      email: g.email,
      organization: g.organization,
      category: g.category,
      rsvpStatus: g.rsvpStatus,
      partySize: g.partySize,
    })),
  });
}

function getGuestDetails(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const guestId = input.guestId as string | undefined;
  if (!guestId) return errorResult('guestId is required.');

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

  return json({
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  if (ctx.tables.length === 0) {
    return errorResult(
      'No tables exist in the active layout version. Add tables before auto-seating.',
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
        tableName: table?.name ?? 'Unknown',
        seatNumber: a.seatNumber,
        reason: a.reason,
      };
    }),
    score: proposal.score,
    summary: proposal.summary,
    note: `${applied} of ${proposal.assignments.length} guests have been seated. Assignments are now LIVE.`,
  });
}

function scoreSeating(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const recommendations = getSeatingRecommendations({
    tables: ctx.tables,
    guests: ctx.guests,
    existingAssignments: ctx.assignments,
    relationshipGroups: ctx.groups,
    relationshipMemberships: ctx.memberships,
    versionId: ctx.versionId,
  });

  const limit =
    typeof input.limit === 'number' ? input.limit : recommendations.length;
  const limited = recommendations.slice(0, limit);

  return json({
    totalRecommendations: recommendations.length,
    showing: limited.length,
    recommendations: limited.map((r) => {
      const guest = ctx.guests.find((g) => g.id === r.guestId);
      const table = ctx.tables.find((t) => t.id === r.tableId);
      return {
        guestId: r.guestId,
        guestName: guest?.displayName ?? 'Unknown',
        tableId: r.tableId,
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const seatingAnalytics = analyzeSeating(
    ctx.tables,
    ctx.assignments,
    ctx.guests,
    ctx.groups,
    ctx.memberships,
    ctx.versionId,
  );

  return json({
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const guestId = input.guestId as string | undefined;
  const templateType = input.templateType as string | undefined;

  if (!guestId) return errorResult('guestId is required.');

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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  if (ctx.guests.length === 0) {
    return errorResult('No guests found for this event.');
  }

  const projection = computeAttendanceProjection(ctx.guests);

  return json({
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  if (ctx.guests.length === 0) {
    return errorResult('No guests found for this event.');
  }

  const analysis = analyzeDietaryNeeds(ctx.guests);

  return json({
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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const guestId = input.guestId as string | undefined;
  if (!guestId) return errorResult('guestId is required.');

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) return errorResult(`Guest "${guestId}" not found.`);

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

  return json({
    updated: true,
    guestId,
    guestName: updates.displayName ?? guest.displayName,
    fieldsChanged: Object.keys(updates),
  });
}

function deleteGuestsTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const guestIds = input.guestIds as string[] | undefined;
  const filter = input.filter as string | undefined;
  const updates: Partial<Guest> = {};

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
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const guestId = input.guestId as string | undefined;
  const tableId = input.tableId as string | undefined;

  if (!guestId) return errorResult('guestId is required.');
  if (!tableId) return errorResult('tableId is required.');

  const guest = ctx.guests.find((g) => g.id === guestId);
  if (!guest) return errorResult(`Guest "${guestId}" not found.`);

  const table = ctx.tables.find((t) => t.id === tableId);
  if (!table) return errorResult(`Table "${tableId}" not found.`);

  const store = useEventStore.getState();
  store.moveGuestToTable(guestId, tableId, ctx.versionId);

  return json({
    moved: true,
    guestName: guest.displayName,
    tableName: table.name,
  });
}

function unseatGuestTool(
  state: StoreState,
  eventId: string,
  input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  const guestId = input.guestId as string | undefined;
  if (!guestId) return errorResult('guestId is required.');

  const assignment = ctx.assignments.find((a) => a.guestId === guestId);
  if (!assignment) return errorResult(`Guest "${guestId}" has no seating assignment.`);

  const store = useEventStore.getState();
  store.removeSeatingAssignment(assignment.id);

  const guest = ctx.guests.find((g) => g.id === guestId);
  return json({
    unseated: true,
    guestName: guest?.displayName ?? guestId,
  });
}

function clearAllSeatingTool(
  state: StoreState,
  eventId: string,
  _input: ToolInput,
): string {
  const ctx = getEventContext(state, eventId);
  if (!ctx) return errorResult(`Event "${eventId}" not found.`);

  if (ctx.assignments.length === 0) {
    return errorResult('No seating assignments to clear.');
  }

  const store = useEventStore.getState();
  const count = ctx.assignments.length;
  for (const a of ctx.assignments) {
    store.removeSeatingAssignment(a.id);
  }

  return json({
    cleared: count,
    note: `All ${count} seating assignments for this version have been removed.`,
  });
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

const TOOL_MAP: Record<
  string,
  (state: StoreState, eventId: string, input: ToolInput) => string
> = {
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
  unseat_guest: unseatGuestTool,
  clear_all_seating: clearAllSeatingTool,
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
export function executeTool(
  name: string,
  input: ToolInput,
  storeState: StoreState,
  eventId: string,
): string {
  const handler = TOOL_MAP[name];
  if (!handler) {
    return errorResult(
      `Unknown tool "${name}". Available tools: ${Object.keys(TOOL_MAP).join(', ')}`,
    );
  }
  try {
    return handler(storeState, eventId, input);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'An unexpected error occurred.';
    return errorResult(`Tool "${name}" failed: ${message}`);
  }
}
