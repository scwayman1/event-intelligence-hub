/**
 * Orchestration Engine — pure function library
 *
 * Every function takes data in and returns a result. No side effects, no store
 * mutations, no network calls. Designed to be called from React hooks or
 * components that read from the Zustand store.
 */

import type {
  AppEvent,
  Guest,
  LayoutObject,
  EventVersion,
  SeatingAssignment,
  RelationshipGroup,
  RelationshipMembership,
  RSVPStatus,
  GuestCategory,
} from '@/types/events';

import type {
  EventHealthScore,
  GuestAnalytics,
  SeatingAnalytics,
  TableUtilization,
  OrchestratorInsight,
  EventMilestone,
  CommTemplate,
} from '@/types/orchestrator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _insightCounter = 0;
function nextInsightId(): string {
  _insightCounter += 1;
  return `insight-${Date.now()}-${_insightCounter}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

/** All RSVP statuses, used to ensure Record completeness. */
const ALL_RSVP_STATUSES: RSVPStatus[] = [
  'invited',
  'confirmed',
  'declined',
  'waitlist',
  'checked_in',
];

const ALL_GUEST_CATEGORIES: GuestCategory[] = [
  'donor',
  'scholarship_recipient',
  'family',
  'board_member',
  'vip',
  'staff',
  'sponsor',
  'volunteer',
  'other',
];

/** Categories considered "high priority" for follow-up purposes. */
const HIGH_PRIORITY_CATEGORIES: GuestCategory[] = [
  'donor',
  'vip',
  'board_member',
  'sponsor',
];

/** Is this layout object a table type? */
function isTable(obj: LayoutObject): boolean {
  return obj.type === 'round_table' || obj.type === 'rect_table';
}

/** Days between two ISO date strings (positive if b is after a). */
function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / msPerDay,
  );
}

/** Clamp a number between 0 and 100. */
function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ---------------------------------------------------------------------------
// 1. computeEventHealth
// ---------------------------------------------------------------------------

/**
 * Compute a multi-dimensional health score (0-100 per dimension) for an event.
 *
 * Weights for the overall score:
 *   guest confirmation  35%
 *   seating completion  25%
 *   layout readiness    20%
 *   communication       20%
 */
export function computeEventHealth(
  event: AppEvent,
  guests: Guest[],
  tables: LayoutObject[],
  assignments: SeatingAssignment[],
  _versions: EventVersion[],
): EventHealthScore {
  const eventGuests = guests.filter((g) => g.eventId === event.id);
  const eventTables = tables.filter(isTable);

  // -- Guest confirmation --
  const nonDeclined = eventGuests.filter((g) => g.rsvpStatus !== 'declined');
  const confirmed = eventGuests.filter(
    (g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in',
  );
  const guestConfirmation =
    nonDeclined.length > 0
      ? clamp100((confirmed.length / nonDeclined.length) * 100)
      : 0;

  // -- Seating completion --
  const confirmedIds = new Set(confirmed.map((g) => g.id));
  const seatedConfirmed = assignments.filter((a) => confirmedIds.has(a.guestId));
  const seatingCompletion =
    confirmed.length > 0
      ? clamp100((seatedConfirmed.length / confirmed.length) * 100)
      : 0;

  // -- Layout readiness --
  const totalCapacity = eventTables.reduce((sum, t) => sum + t.capacity, 0);
  const expectedAttendance = confirmed.reduce((sum, g) => sum + g.partySize, 0);
  let layoutReadiness: number;
  if (eventTables.length === 0) {
    layoutReadiness = 0;
  } else if (totalCapacity >= expectedAttendance) {
    // Enough capacity — score scales from 70 (barely enough) to 100 (20%+ buffer)
    const bufferRatio =
      expectedAttendance > 0 ? totalCapacity / expectedAttendance : 1;
    layoutReadiness = clamp100(70 + (bufferRatio - 1) * 150);
  } else {
    // Not enough — scale down proportionally
    layoutReadiness = clamp100(
      (totalCapacity / Math.max(expectedAttendance, 1)) * 70,
    );
  }

  // -- Communication status (simulated) --
  // For demo: treat confirmed + declined as "contacted" (they responded).
  // Invited/waitlist guests are assumed not yet contacted.
  const contacted = eventGuests.filter(
    (g) =>
      g.rsvpStatus === 'confirmed' ||
      g.rsvpStatus === 'declined' ||
      g.rsvpStatus === 'checked_in',
  );
  const communicationStatus =
    eventGuests.length > 0
      ? clamp100((contacted.length / eventGuests.length) * 100)
      : 0;

  // -- Overall (weighted) --
  const overall = clamp100(
    guestConfirmation * 0.35 +
      seatingCompletion * 0.25 +
      layoutReadiness * 0.2 +
      communicationStatus * 0.2,
  );

  return {
    overall,
    guestConfirmation,
    seatingCompletion,
    layoutReadiness,
    communicationStatus,
  };
}

// ---------------------------------------------------------------------------
// 2. analyzeGuests
// ---------------------------------------------------------------------------

/**
 * Produce a comprehensive guest analytics breakdown for a single event.
 */
export function analyzeGuests(guests: Guest[], eventId: string): GuestAnalytics {
  const eventGuests = guests.filter((g) => g.eventId === eventId);

  // -- Counts by status --
  const byStatus = Object.fromEntries(
    ALL_RSVP_STATUSES.map((s) => [s, 0]),
  ) as Record<RSVPStatus, number>;
  for (const g of eventGuests) {
    byStatus[g.rsvpStatus] += 1;
  }

  // -- Counts by category --
  const byCategory = Object.fromEntries(
    ALL_GUEST_CATEGORIES.map((c) => [c, 0]),
  ) as Record<GuestCategory, number>;
  for (const g of eventGuests) {
    byCategory[g.category] += 1;
  }

  // -- Confirmation rate --
  const nonDeclined = eventGuests.filter((g) => g.rsvpStatus !== 'declined');
  const confirmedOrCheckedIn = eventGuests.filter(
    (g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in',
  );
  const confirmationRate =
    nonDeclined.length > 0
      ? Math.round((confirmedOrCheckedIn.length / nonDeclined.length) * 100)
      : 0;

  // -- High-priority pending --
  const pendingHighPriority = eventGuests.filter(
    (g) =>
      HIGH_PRIORITY_CATEGORIES.includes(g.category) &&
      g.rsvpStatus !== 'confirmed' &&
      g.rsvpStatus !== 'declined' &&
      g.rsvpStatus !== 'checked_in',
  );

  // -- Needs follow-up (still at 'invited') --
  const needsFollowUp = eventGuests.filter(
    (g) => g.rsvpStatus === 'invited',
  );

  // -- Recent confirmations (simulated: first 5 confirmed guests) --
  const recentConfirmations = confirmedOrCheckedIn.slice(0, 5);

  // -- Dietary summary --
  const dietarySummary: Record<string, number> = {};
  for (const g of eventGuests) {
    const raw = g.dietaryRestrictions.trim();
    if (raw) {
      // A guest may list multiple restrictions separated by commas
      const items = raw.split(',').map((s) => s.trim()).filter(Boolean);
      for (const item of items) {
        const key = item.toLowerCase();
        dietarySummary[key] = (dietarySummary[key] ?? 0) + 1;
      }
    }
  }

  // -- Accessibility needs --
  const accessibilityNeeds = eventGuests.filter(
    (g) => g.accessibilityNeeds.trim().length > 0,
  );

  // -- Plus-one count --
  const plusOneCount = eventGuests.filter((g) => !!g.plusOneId).length;

  // -- Total expected attendance (party size of confirmed / checked-in) --
  const totalExpectedAttendance = confirmedOrCheckedIn.reduce(
    (sum, g) => sum + g.partySize,
    0,
  );

  return {
    total: eventGuests.length,
    byStatus,
    byCategory,
    confirmationRate,
    pendingHighPriority,
    recentConfirmations,
    needsFollowUp,
    dietarySummary,
    accessibilityNeeds,
    plusOneCount,
    totalExpectedAttendance,
  };
}

// ---------------------------------------------------------------------------
// 3. analyzeSeating
// ---------------------------------------------------------------------------

/**
 * Analyze seating utilization and relationship-group placement for a given
 * layout version.
 */
export function analyzeSeating(
  tables: LayoutObject[],
  assignments: SeatingAssignment[],
  guests: Guest[],
  groups: RelationshipGroup[],
  memberships: RelationshipMembership[],
  versionId: string,
): SeatingAnalytics {
  const versionTables = tables.filter(
    (t) => t.versionId === versionId && isTable(t),
  );
  const versionAssignments = assignments.filter(
    (a) => a.versionId === versionId,
  );

  const totalCapacity = versionTables.reduce((s, t) => s + t.capacity, 0);

  // Build a map: tableId -> set of seated guestIds
  const seatedByTable = new Map<string, Set<string>>();
  for (const a of versionAssignments) {
    if (!seatedByTable.has(a.tableId)) {
      seatedByTable.set(a.tableId, new Set());
    }
    seatedByTable.get(a.tableId)!.add(a.guestId);
  }

  // All seated guest IDs in this version
  const allSeatedIds = new Set(versionAssignments.map((a) => a.guestId));

  // Confirmed guests for this event (derive eventId from tables' version)
  const confirmedGuests = guests.filter(
    (g) =>
      (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in') &&
      !allSeatedIds.has(g.id) === false, // placeholder — computed below
  );
  // Actually compute unseated confirmed
  const confirmedIds = new Set(
    guests
      .filter(
        (g) => g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in',
      )
      .map((g) => g.id),
  );
  const seatedConfirmedCount = [...allSeatedIds].filter((id) =>
    confirmedIds.has(id),
  ).length;
  const unseatedConfirmed = confirmedIds.size - seatedConfirmedCount;

  // Per-table utilization
  const tableUtilization: TableUtilization[] = versionTables.map((table) => {
    const seated = seatedByTable.get(table.id)?.size ?? 0;
    const capacity = table.capacity || 1; // avoid div-by-zero
    const utilizationPct = Math.round((seated / capacity) * 100);

    // Check if any seated guest is the anchor of a relationship group
    const seatedGuestIds = seatedByTable.get(table.id) ?? new Set<string>();
    let hasAnchor = false;
    let anchorGroupName: string | undefined;
    for (const gId of seatedGuestIds) {
      const gMemberships = memberships.filter((m) => m.guestId === gId);
      for (const m of gMemberships) {
        const group = groups.find((gr) => gr.id === m.groupId);
        if (group) {
          hasAnchor = true;
          anchorGroupName = group.name;
          break;
        }
      }
      if (hasAnchor) break;
    }

    return { table, seated, capacity, utilizationPct, hasAnchor, anchorGroupName };
  });

  const emptyTables = tableUtilization.filter((t) => t.seated === 0).length;
  const fullTables = tableUtilization.filter(
    (t) => t.seated >= t.capacity && t.capacity > 0,
  ).length;
  const overCapacityTables = tableUtilization.filter(
    (t) => t.seated > t.capacity,
  ).length;
  const averageUtilization =
    tableUtilization.length > 0
      ? Math.round(
          tableUtilization.reduce((s, t) => s + t.utilizationPct, 0) /
            tableUtilization.length,
        )
      : 0;

  // -- Relationship group analysis --
  let relationshipGroupsComplete = 0;
  let relationshipGroupsPartial = 0;
  let relationshipGroupsUnseated = 0;

  for (const group of groups) {
    const memberGuestIds = memberships
      .filter((m) => m.groupId === group.id)
      .map((m) => m.guestId);

    if (memberGuestIds.length === 0) continue;

    const seatedMembers = memberGuestIds.filter((id) => allSeatedIds.has(id));

    if (seatedMembers.length === 0) {
      relationshipGroupsUnseated += 1;
      continue;
    }

    // Check if all seated members share the same table
    const memberTables = new Set<string>();
    for (const a of versionAssignments) {
      if (memberGuestIds.includes(a.guestId)) {
        memberTables.add(a.tableId);
      }
    }

    if (
      seatedMembers.length === memberGuestIds.length &&
      memberTables.size === 1
    ) {
      relationshipGroupsComplete += 1;
    } else {
      relationshipGroupsPartial += 1;
    }
  }

  return {
    totalTables: versionTables.length,
    totalCapacity,
    seatedGuests: allSeatedIds.size,
    unseatedConfirmed,
    tableUtilization,
    averageUtilization,
    emptyTables,
    fullTables,
    overCapacityTables,
    relationshipGroupsComplete,
    relationshipGroupsPartial,
    relationshipGroupsUnseated,
  };
}

// ---------------------------------------------------------------------------
// 4. generateInsights
// ---------------------------------------------------------------------------

/**
 * Produce context-aware insights and recommendations based on the current
 * state of the event. Returns an array sorted by priority (critical first).
 */
export function generateInsights(
  event: AppEvent,
  guestAnalytics: GuestAnalytics,
  seatingAnalytics: SeatingAnalytics,
  healthScore: EventHealthScore,
): OrchestratorInsight[] {
  const insights: OrchestratorInsight[] = [];
  const now = isoNow();
  const daysUntilEvent = daysBetween(new Date().toISOString(), event.date);

  // --- Critical: High-priority guests not confirmed and event is near ---
  if (guestAnalytics.pendingHighPriority.length > 0) {
    const count = guestAnalytics.pendingHighPriority.length;
    const categories = [
      ...new Set(guestAnalytics.pendingHighPriority.map((g) => g.category)),
    ].join(', ');

    const priority =
      daysUntilEvent <= 14 && count >= 3
        ? 'critical'
        : daysUntilEvent <= 30
          ? 'high'
          : 'medium';

    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'alert',
      priority,
      category: 'guests',
      title: `${count} high-priority guest${count !== 1 ? 's' : ''} haven't confirmed`,
      description:
        daysUntilEvent > 0
          ? `${count} ${categories} guest${count !== 1 ? 's' : ''} ${count !== 1 ? 'have' : 'has'} not confirmed and the event is in ${daysUntilEvent} day${daysUntilEvent !== 1 ? 's' : ''}.`
          : `${count} ${categories} guest${count !== 1 ? 's' : ''} ${count !== 1 ? 'have' : 'has'} not confirmed and the event date has passed.`,
      actionLabel: 'Send Reminders',
      actionType: 'send_reminders',
      metadata: {
        guestIds: guestAnalytics.pendingHighPriority.map((g) => g.id),
      },
      createdAt: now,
      dismissed: false,
    });
  }

  // --- High: Unseated confirmed guests ---
  if (seatingAnalytics.unseatedConfirmed > 0) {
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'action_needed',
      priority: seatingAnalytics.unseatedConfirmed >= 10 ? 'high' : 'medium',
      category: 'seating',
      title: `${seatingAnalytics.unseatedConfirmed} confirmed guest${seatingAnalytics.unseatedConfirmed !== 1 ? 's are' : ' is'} not yet seated`,
      description: `There ${seatingAnalytics.unseatedConfirmed !== 1 ? 'are' : 'is'} ${seatingAnalytics.unseatedConfirmed} confirmed guest${seatingAnalytics.unseatedConfirmed !== 1 ? 's' : ''} without a seating assignment. Use auto-seat to place them quickly.`,
      actionLabel: 'Auto-Seat',
      actionType: 'auto_seat',
      createdAt: now,
      dismissed: false,
    });
  }

  // --- Medium/High: Over-capacity tables ---
  if (seatingAnalytics.overCapacityTables > 0) {
    const overTables = seatingAnalytics.tableUtilization.filter(
      (t) => t.seated > t.capacity,
    );
    const tableNames = overTables.map((t) => t.table.name).join(', ');
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'alert',
      priority: 'high',
      category: 'seating',
      title: `${seatingAnalytics.overCapacityTables} table${seatingAnalytics.overCapacityTables !== 1 ? 's are' : ' is'} over capacity`,
      description: `The following table${seatingAnalytics.overCapacityTables !== 1 ? 's exceed' : ' exceeds'} their seating capacity: ${tableNames}. Consider redistributing guests.`,
      actionLabel: 'Optimize Seating',
      actionType: 'optimize_seating',
      metadata: { tableIds: overTables.map((t) => t.table.id) },
      createdAt: now,
      dismissed: false,
    });
  }

  // --- Medium: Guests needing follow-up ---
  if (guestAnalytics.needsFollowUp.length > 0) {
    const count = guestAnalytics.needsFollowUp.length;
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'action_needed',
      priority: daysUntilEvent <= 21 ? 'high' : 'medium',
      category: 'communications',
      title: `Send RSVP reminders to ${count} pending guest${count !== 1 ? 's' : ''}`,
      description: `${count} guest${count !== 1 ? 's have' : ' has'} been invited but ${count !== 1 ? 'have' : 'has'} not yet responded. A friendly reminder may help increase your confirmation rate.`,
      actionLabel: 'Send Reminders',
      actionType: 'send_reminders',
      metadata: {
        guestIds: guestAnalytics.needsFollowUp.map((g) => g.id),
      },
      createdAt: now,
      dismissed: false,
    });
  }

  // --- Medium: Partial relationship groups ---
  if (seatingAnalytics.relationshipGroupsPartial > 0) {
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'recommendation',
      priority: 'medium',
      category: 'seating',
      title: `${seatingAnalytics.relationshipGroupsPartial} relationship group${seatingAnalytics.relationshipGroupsPartial !== 1 ? 's have' : ' has'} partial seating`,
      description: `Some relationship groups are only partially seated together. Auto-complete their seating to keep connected guests at the same table.`,
      actionLabel: 'Auto-Seat',
      actionType: 'auto_seat',
      createdAt: now,
      dismissed: false,
    });
  }

  // --- Layout readiness warning ---
  if (healthScore.layoutReadiness < 50 && seatingAnalytics.totalTables > 0) {
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'alert',
      priority: 'high',
      category: 'layout',
      title: 'Table capacity may be insufficient',
      description: `Current table capacity (${seatingAnalytics.totalCapacity} seats) may not accommodate the expected attendance (${guestAnalytics.totalExpectedAttendance} guests). Review your layout and add tables if needed.`,
      actionLabel: 'Check Layout',
      actionType: 'check_layout',
      createdAt: now,
      dismissed: false,
    });
  }

  if (seatingAnalytics.totalTables === 0) {
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'action_needed',
      priority: daysUntilEvent <= 30 ? 'high' : 'medium',
      category: 'layout',
      title: 'No tables in the current layout',
      description:
        'The active layout version has no tables. Add tables to begin seating your confirmed guests.',
      actionLabel: 'Check Layout',
      actionType: 'check_layout',
      createdAt: now,
      dismissed: false,
    });
  }

  // --- Accessibility needs ---
  if (guestAnalytics.accessibilityNeeds.length > 0) {
    const count = guestAnalytics.accessibilityNeeds.length;
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'action_needed',
      priority: 'medium',
      category: 'logistics',
      title: `${count} guest${count !== 1 ? 's' : ''} with accessibility requirements`,
      description: `Ensure accessible seating and venue accommodations for ${count} guest${count !== 1 ? 's' : ''} who specified accessibility needs.`,
      actionLabel: 'Review Guests',
      actionType: 'review_guests',
      metadata: {
        guestIds: guestAnalytics.accessibilityNeeds.map((g) => g.id),
      },
      createdAt: now,
      dismissed: false,
    });
  }

  // --- Milestones (positive) ---
  if (guestAnalytics.confirmationRate >= 80) {
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'milestone',
      priority: 'low',
      category: 'guests',
      title: 'Guest confirmation rate crossed 80%',
      description: `${guestAnalytics.confirmationRate}% of your guests have confirmed. You're on track for a strong turnout.`,
      createdAt: now,
      dismissed: false,
    });
  }

  if (
    seatingAnalytics.relationshipGroupsComplete > 0 &&
    seatingAnalytics.relationshipGroupsPartial === 0 &&
    seatingAnalytics.relationshipGroupsUnseated === 0
  ) {
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'milestone',
      priority: 'low',
      category: 'seating',
      title: 'All relationship groups are fully seated',
      description: `Every relationship group has all its members seated together. Great job coordinating the seating!`,
      createdAt: now,
      dismissed: false,
    });
  }

  if (healthScore.overall >= 90) {
    insights.push({
      id: nextInsightId(),
      eventId: event.id,
      type: 'milestone',
      priority: 'low',
      category: 'logistics',
      title: 'Event readiness is excellent',
      description: `Your overall event health score is ${healthScore.overall}%. The event is in great shape.`,
      createdAt: now,
      dismissed: false,
    });
  }

  // Sort by priority: critical > high > medium > low
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  insights.sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
  );

  return insights;
}

// ---------------------------------------------------------------------------
// 5. generateEventTimeline
// ---------------------------------------------------------------------------

/**
 * Generate a planning timeline of milestones relative to the event date.
 * Milestone completion is inferred from guest analytics.
 */
export function generateEventTimeline(
  event: AppEvent,
  guestAnalytics: GuestAnalytics,
): EventMilestone[] {
  const eventDate = new Date(event.date);

  /** Subtract days from the event date, return ISO date string. */
  function daysBeforeEvent(days: number): string {
    const d = new Date(eventDate);
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }

  const today = new Date().toISOString().slice(0, 10);
  const hasGuests = guestAnalytics.total > 0;
  const hasConfirmations =
    guestAnalytics.byStatus.confirmed + guestAnalytics.byStatus.checked_in > 0;

  return [
    {
      id: 'ms-planning',
      label: 'Create Event & Layout',
      description:
        'Set up the event details, venue layout, and table arrangements.',
      dueDate: daysBeforeEvent(60),
      completed: true, // the event already exists
      category: 'planning',
    },
    {
      id: 'ms-invitations',
      label: 'Send Invitations',
      description:
        'Import your guest list and send out invitations or save-the-dates.',
      dueDate: daysBeforeEvent(45),
      completed: hasGuests,
      category: 'invitations',
    },
    {
      id: 'ms-rsvp-deadline',
      label: 'First RSVP Deadline',
      description:
        'Target date for the first round of RSVPs. Follow up with non-responders.',
      dueDate: daysBeforeEvent(30),
      completed: guestAnalytics.confirmationRate >= 50,
      category: 'confirmations',
    },
    {
      id: 'ms-followup',
      label: 'Follow-Up Reminders',
      description:
        'Send friendly reminders to guests who have not yet responded.',
      dueDate: daysBeforeEvent(21),
      completed:
        guestAnalytics.needsFollowUp.length === 0 && hasConfirmations,
      category: 'confirmations',
    },
    {
      id: 'ms-seating',
      label: 'Finalize Seating Assignments',
      description:
        'Assign all confirmed guests to tables and verify relationship group placement.',
      dueDate: daysBeforeEvent(14),
      completed: false, // consumers can override based on seating analytics
      category: 'seating',
    },
    {
      id: 'ms-table-notifications',
      label: 'Send Table Assignment Notifications',
      description:
        'Notify confirmed guests of their table assignments and event-day details.',
      dueDate: daysBeforeEvent(10),
      completed: false,
      category: 'seating',
    },
    {
      id: 'ms-final-headcount',
      label: 'Final Headcount',
      description:
        'Lock the guest list and share final numbers with catering and venue.',
      dueDate: daysBeforeEvent(7),
      completed: guestAnalytics.confirmationRate >= 90,
      category: 'logistics',
    },
    {
      id: 'ms-day-of-prep',
      label: 'Day-of Logistics Prep',
      description:
        'Print seating charts, prepare name cards, confirm AV setup, and brief staff.',
      dueDate: daysBeforeEvent(2),
      completed: today > daysBeforeEvent(2) && today >= event.date,
      category: 'logistics',
    },
    {
      id: 'ms-event-day',
      label: 'Event Day',
      description:
        'Execute check-in, manage seating, and enjoy the celebration!',
      dueDate: event.date,
      completed: today > event.date,
      category: 'day_of',
    },
  ];
}

// ---------------------------------------------------------------------------
// 6. getDefaultCommTemplates
// ---------------------------------------------------------------------------

/**
 * Return the five built-in communication templates.
 * Placeholder tokens: {{firstName}}, {{eventName}}, {{eventDate}}, {{tableName}}.
 */
export function getDefaultCommTemplates(): CommTemplate[] {
  return [
    {
      id: 'tpl-rsvp-reminder',
      type: 'rsvp_reminder',
      name: 'RSVP Reminder',
      subject: "You're Invited \u2014 Please RSVP for {{eventName}}",
      applicableTo: 'all',
      bodyTemplate: [
        'Dear {{firstName}},',
        '',
        'We hope this message finds you well. We wanted to follow up on your invitation to {{eventName}}, taking place on {{eventDate}}.',
        '',
        'We would love to have you join us for this special occasion celebrating our scholars, donors, and community. Your presence means a great deal to our foundation and to the students whose futures you help shape.',
        '',
        "If you haven't already, please take a moment to confirm your attendance so we can finalize our preparations.",
        '',
        "Should you have any questions about the event or need special accommodations, please don't hesitate to reach out.",
        '',
        'Warm regards,',
        'The Event Planning Team',
      ].join('\n'),
    },
    {
      id: 'tpl-confirmation-thanks',
      type: 'confirmation_thanks',
      name: 'Confirmation Thank You',
      subject: 'Thank You for Confirming — {{eventName}}',
      applicableTo: 'all',
      bodyTemplate: [
        'Dear {{firstName}},',
        '',
        "Thank you for confirming your attendance at {{eventName}} on {{eventDate}}! We're delighted you'll be joining us.",
        '',
        "Here's what to expect:",
        '• Doors open 30 minutes before the program begins',
        '• A reception with light refreshments will precede the main event',
        '• The ceremony will include scholar recognition and donor appreciation segments',
        '',
        'We will follow up closer to the date with your table assignment and any additional details. In the meantime, please let us know if you have any dietary restrictions or accessibility requirements we should be aware of.',
        '',
        'We look forward to seeing you there!',
        '',
        'Warm regards,',
        'The Event Planning Team',
      ].join('\n'),
    },
    {
      id: 'tpl-table-assignment',
      type: 'table_assignment',
      name: 'Table Assignment',
      subject: 'Your Table Assignment for {{eventName}}',
      applicableTo: 'all',
      bodyTemplate: [
        'Dear {{firstName}},',
        '',
        "As {{eventName}} on {{eventDate}} approaches, we're excited to share your seating details.",
        '',
        "You have been assigned to {{tableName}}. We've taken care to seat you with others we think you'll enjoy connecting with throughout the evening.",
        '',
        'A few reminders for the day:',
        '• Please check in at the registration table upon arrival',
        '• Table name cards will guide you to your seat',
        '• Our staff will be happy to assist with any needs during the event',
        '',
        'If you have any last-minute changes or questions, please contact us as soon as possible.',
        '',
        "We can't wait to celebrate with you!",
        '',
        'Warm regards,',
        'The Event Planning Team',
      ].join('\n'),
    },
    {
      id: 'tpl-event-update',
      type: 'event_update',
      name: 'Event Update',
      subject: 'Important Update — {{eventName}}',
      applicableTo: 'all',
      bodyTemplate: [
        'Dear {{firstName}},',
        '',
        "We're writing with an update regarding {{eventName}} scheduled for {{eventDate}}.",
        '',
        'Please note the following:',
        '',
        '[Update details here]',
        '',
        "We appreciate your flexibility and understanding. If you have any questions or concerns, please don't hesitate to reach out to our planning team.",
        '',
        'Thank you for your continued support of our scholars and our mission.',
        '',
        'Warm regards,',
        'The Event Planning Team',
      ].join('\n'),
    },
    {
      id: 'tpl-custom',
      type: 'custom',
      name: 'Custom Message',
      subject: '{{eventName}} — ',
      applicableTo: 'all',
      bodyTemplate: [
        'Dear {{firstName}},',
        '',
        '',
        '',
        'Warm regards,',
        'The Event Planning Team',
      ].join('\n'),
    },
  ];
}

// ---------------------------------------------------------------------------
// 7. renderTemplate
// ---------------------------------------------------------------------------

/**
 * Replace all {{placeholder}} tokens in a template with concrete values.
 * Returns the rendered subject and body.
 */
export function renderTemplate(
  template: CommTemplate,
  guest: Guest,
  event: AppEvent,
  tableName?: string,
): { subject: string; body: string } {
  const replacements: Record<string, string> = {
    '{{firstName}}': guest.firstName,
    '{{lastName}}': guest.lastName,
    '{{displayName}}': guest.displayName,
    '{{email}}': guest.email,
    '{{eventName}}': event.name,
    '{{eventDate}}': event.date,
    '{{eventTime}}': event.time,
    '{{venue}}': event.venue,
    '{{venueAddress}}': event.venueAddress,
    '{{tableName}}': tableName ?? 'TBD',
  };

  function applyReplacements(text: string): string {
    let result = text;
    for (const [token, value] of Object.entries(replacements)) {
      // Use split/join for global replacement without regex escaping issues
      result = result.split(token).join(value);
    }
    return result;
  }

  return {
    subject: applyReplacements(template.subject),
    body: applyReplacements(template.bodyTemplate),
  };
}
