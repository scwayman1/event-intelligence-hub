/**
 * Smart Seating Engine — pure function library
 *
 * Generates intelligent seating proposals by analyzing relationship groups,
 * guest categories, preferences, and table capacities. Every function is pure
 * — no side effects, no store mutations, no network calls.
 */

import type {
  Guest,
  LayoutObject,
  SeatingAssignment,
  RelationshipGroup,
  RelationshipMembership,
  GuestCategory,
} from '@/types/events';

// ---------------------------------------------------------------------------
// Exported Types
// ---------------------------------------------------------------------------

export interface SeatingProposal {
  assignments: Array<{
    guestId: string;
    tableId: string;
    seatNumber: number;
    reason: string;
  }>;
  score: SeatingScore;
  summary: {
    totalSeated: number;
    totalUnseated: number;
    groupsFullySeated: number;
    groupsPartiallySplit: number;
    tablesUsed: number;
  };
  log: string[];
}

export interface SeatingScore {
  overall: number;
  relationshipSatisfaction: number;
  categoryClustering: number;
  utilizationBalance: number;
  preferenceSatisfaction: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Is this layout object a table? */
function isTable(obj: LayoutObject): boolean {
  return obj.type === 'round_table' || obj.type === 'rect_table';
}

/** Clamp a number between 0 and 100. */
function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Guest categories that qualify as anchors (placed first). */
const ANCHOR_CATEGORIES: GuestCategory[] = ['donor', 'sponsor', 'board_member', 'vip'];

/** Normalize a guest category to lowercase with underscores for safe comparison. */
function normalizeGuestCategory(cat: string): string {
  return cat.toLowerCase().replace(/\s+/g, '_');
}

/** Membership roles considered anchor roles (compared case-insensitively). */
const ANCHOR_ROLES = new Set(['donor', 'host', 'mentor', 'sponsor']);

/** Check if a role is an anchor role (case-insensitive). */
function isAnchorRole(role: string): boolean {
  return ANCHOR_ROLES.has(role.toLowerCase());
}

/** Categories considered "VIP-tier" for clustering at premium tables. */
const VIP_TIER_CATEGORIES = new Set<GuestCategory>(['donor', 'board_member', 'vip', 'sponsor']);

// ---------------------------------------------------------------------------
// Internal State Types
// ---------------------------------------------------------------------------

interface TableState {
  tableId: string;
  tableName: string;
  capacity: number;
  seated: Set<string>; // guestIds
}

interface ProposalParams {
  tables: LayoutObject[];
  guests: Guest[];
  existingAssignments: SeatingAssignment[];
  relationshipGroups: RelationshipGroup[];
  relationshipMemberships: RelationshipMembership[];
  versionId: string;
  /** Categories to disperse across tables instead of clustering (e.g. ['donor', 'vip']) */
  disperseCategories?: string[];
  /** Free-text strategy hint from the user/LLM */
  strategy?: string;
  /** When true, include 'invited' guests (not just confirmed/checked_in) in auto-seating */
  includeInvited?: boolean;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function buildTableStates(tables: LayoutObject[], versionId: string): TableState[] {
  return tables
    .filter((t) => isTable(t) && t.versionId === versionId)
    .map((t) => ({
      tableId: t.id,
      tableName: t.name,
      capacity: t.capacity || 8,
      seated: new Set<string>(),
    }));
}

function findNextSeatNumber(state: TableState): number {
  return state.seated.size + 1;
}

function hasRoom(state: TableState): boolean {
  return state.seated.size < state.capacity;
}

function getRemainingCapacity(state: TableState): number {
  return Math.max(0, state.capacity - state.seated.size);
}

function getTableByName(tableStates: TableState[], name: string): TableState | undefined {
  const normalized = name.trim().toLowerCase();
  return tableStates.find((t) => t.tableName.toLowerCase() === normalized);
}

function getTableById(tableStates: TableState[], id: string): TableState | undefined {
  return tableStates.find((t) => t.tableId === id);
}

/** Find the table with the most remaining capacity. */
function findBestAvailableTable(tableStates: TableState[]): TableState | undefined {
  return tableStates
    .filter(hasRoom)
    .sort((a, b) => getRemainingCapacity(b) - getRemainingCapacity(a))[0];
}

/** Find a table appropriate for VIP guests (least-filled table with VIP capacity preference). */
function findVIPTable(tableStates: TableState[], seatedGuests: Map<string, string>): TableState | undefined {
  // Prefer tables that already have VIP guests, then least-filled
  return tableStates
    .filter(hasRoom)
    .sort((a, b) => {
      // Tables with fewer seated guests are preferred for VIP clustering
      return a.seated.size - b.seated.size;
    })[0];
}

// ---------------------------------------------------------------------------
// 1. generateSeatingProposal
// ---------------------------------------------------------------------------

/**
 * Generate a complete seating proposal using a 5-pass algorithm:
 *
 * Pass 1: Place relationship group anchors (donors/hosts/sponsors) at tables
 * Pass 2: Fill relationship group members near their anchor
 * Pass 3: Category clustering (board members at VIP tables, families together, plus-ones adjacent)
 * Pass 4: Balanced fill of remaining guests
 * Pass 5: Score the arrangement
 *
 * Existing assignments are preserved and never moved.
 */
export function generateSeatingProposal(params: ProposalParams): SeatingProposal {
  const {
    tables,
    guests,
    existingAssignments,
    relationshipGroups,
    relationshipMemberships,
    versionId,
    disperseCategories,
    strategy,
  } = params;

  const log: string[] = [];
  const newAssignments: Array<{
    guestId: string;
    tableId: string;
    seatNumber: number;
    reason: string;
  }> = [];

  // Build table states
  const tableStates = buildTableStates(tables, versionId);
  if (tableStates.length === 0) {
    log.push('No tables found in this version. Cannot generate proposal.');
    return {
      assignments: [],
      score: { overall: 0, relationshipSatisfaction: 0, categoryClustering: 0, utilizationBalance: 0, preferenceSatisfaction: 0 },
      summary: { totalSeated: 0, totalUnseated: guests.length, groupsFullySeated: 0, groupsPartiallySplit: 0, tablesUsed: 0 },
      log,
    };
  }

  log.push(`Starting seating proposal with ${tableStates.length} tables and ${guests.length} guests.`);

  // Index guests
  const guestById = new Map(guests.map((g) => [g.id, g]));

  // Track which guests are already seated (from existing assignments)
  const alreadySeated = new Set<string>();
  const versionAssignments = existingAssignments.filter((a) => a.versionId === versionId);

  for (const assignment of versionAssignments) {
    const tableState = getTableById(tableStates, assignment.tableId);
    if (tableState) {
      tableState.seated.add(assignment.guestId);
      alreadySeated.add(assignment.guestId);
    }
  }

  log.push(`${alreadySeated.size} guests already have existing assignments (preserved).`);

  // Consider all guests who haven't explicitly declined for auto-seating.
  // Many imported guests remain in 'invited' or 'waitlist' status and still
  // need seats assigned — filtering only 'confirmed' silently drops them.
  const eligibleGuests = guests.filter(
    (g) =>
      !alreadySeated.has(g.id) &&
      g.rsvpStatus !== 'declined',
  );
  const unseatedSet = new Set(eligibleGuests.map((g) => g.id));

  log.push(`${eligibleGuests.length} confirmed guests need seating.`);

  // Index relationship data
  const membershipsByGroup = new Map<string, RelationshipMembership[]>();
  for (const m of relationshipMemberships) {
    if (!membershipsByGroup.has(m.groupId)) {
      membershipsByGroup.set(m.groupId, []);
    }
    membershipsByGroup.get(m.groupId)!.push(m);
  }

  const membershipsByGuest = new Map<string, RelationshipMembership[]>();
  for (const m of relationshipMemberships) {
    if (!membershipsByGuest.has(m.guestId)) {
      membershipsByGuest.set(m.guestId, []);
    }
    membershipsByGuest.get(m.guestId)!.push(m);
  }

  // ── Pre-pass: Build implicit groups from shared relationship tags ──
  // Guests imported via CSV may have tags like "thornton-scholar", "thornton-family"
  // but no explicit RelationshipGroup records. Extract shared prefixes to create
  // implicit groupings so donors and their recipients sit together.
  const tagGroupMap = new Map<string, Set<string>>(); // tagPrefix → Set<guestId>
  for (const guest of guests) {
    if (!guest.relationshipTags || guest.relationshipTags.length === 0) continue;
    for (const tag of guest.relationshipTags) {
      const normalizedTag = tag.toLowerCase().trim();
      if (!normalizedTag) continue;
      // Extract prefix before last hyphen (e.g., "thornton" from "thornton-scholar")
      const hyphenIdx = normalizedTag.lastIndexOf('-');
      const prefix = hyphenIdx > 0 ? normalizedTag.slice(0, hyphenIdx) : normalizedTag;
      if (!tagGroupMap.has(prefix)) {
        tagGroupMap.set(prefix, new Set());
      }
      tagGroupMap.get(prefix)!.add(guest.id);
    }
  }

  // Convert tag groups with 2+ members into synthetic relationship groups/memberships
  let syntheticGroupCount = 0;
  for (const [prefix, memberIds] of tagGroupMap) {
    if (memberIds.size < 2) continue;
    // Skip if all members are already in an explicit relationship group together
    const alreadyGrouped = [...memberIds].every((id) => membershipsByGuest.has(id));
    if (alreadyGrouped) continue;

    const syntheticGroupId = `tag-group-${prefix}`;
    const syntheticGroup: RelationshipGroup = {
      id: syntheticGroupId,
      orgId: guests[0]?.orgId ?? '',
      eventId: guests[0]?.eventId ?? '',
      name: `${prefix} connection`,
      type: 'scholarship' as any,
      description: `Auto-generated from shared "${prefix}" tags`,
    };
    relationshipGroups.push(syntheticGroup);

    for (const guestId of memberIds) {
      const guest = guestById.get(guestId);
      if (!guest) continue;
      // Determine role from tags: if tag contains "donor", "family", "sponsor" → anchor role
      const guestTags = (guest.relationshipTags ?? []).filter((t) => t.toLowerCase().startsWith(prefix));
      const tagSuffix = guestTags.map((t) => t.toLowerCase().split('-').pop()).join(',');
      const isAnchor = /donor|family|sponsor|host|mentor|board/.test(tagSuffix)
        || ANCHOR_CATEGORIES.includes(normalizeGuestCategory(guest.category) as GuestCategory);
      const role = isAnchor ? 'donor' : 'recipient';

      const membership: RelationshipMembership = {
        id: `tag-member-${prefix}-${guestId.slice(-6)}`,
        groupId: syntheticGroupId,
        guestId,
        role,
      };

      if (!membershipsByGroup.has(syntheticGroupId)) {
        membershipsByGroup.set(syntheticGroupId, []);
      }
      membershipsByGroup.get(syntheticGroupId)!.push(membership);

      if (!membershipsByGuest.has(guestId)) {
        membershipsByGuest.set(guestId, []);
      }
      membershipsByGuest.get(guestId)!.push(membership);
    }
    syntheticGroupCount++;
  }

  if (syntheticGroupCount > 0) {
    log.push(`Created ${syntheticGroupCount} implicit groups from shared relationship tags.`);
  }

  // Helper to place a guest
  function placeGuest(guestId: string, tableState: TableState, reason: string): boolean {
    if (!unseatedSet.has(guestId)) return false;
    if (!hasRoom(tableState)) return false;

    const seatNumber = findNextSeatNumber(tableState);
    tableState.seated.add(guestId);
    unseatedSet.delete(guestId);
    newAssignments.push({ guestId, tableId: tableState.tableId, seatNumber, reason });
    return true;
  }

  // ── Pass 1: Place relationship group anchors ──
  log.push('--- Pass 1: Placing relationship group anchors ---');

  const eventGroups = relationshipGroups.filter((g) =>
    guests.some((guest) => guest.eventId && membershipsByGroup.get(g.id)?.some((m) => m.guestId === guest.id)),
  );

  for (const group of eventGroups) {
    const members = membershipsByGroup.get(group.id) ?? [];
    // Find the anchor member(s) — those with anchor roles or anchor categories
    const anchorMembers = members.filter((m) => {
      if (isAnchorRole(m.role)) return true;
      const guest = guestById.get(m.guestId);
      return guest && ANCHOR_CATEGORIES.includes(normalizeGuestCategory(guest.category) as GuestCategory);
    });

    for (const anchorMembership of anchorMembers) {
      const anchor = guestById.get(anchorMembership.guestId);
      if (!anchor || !unseatedSet.has(anchor.id)) continue;

      // Respect table preference
      let targetTable: TableState | undefined;
      if (anchor.tablePreference) {
        targetTable = getTableByName(tableStates, anchor.tablePreference);
        if (targetTable && !hasRoom(targetTable)) {
          log.push(`Anchor ${anchor.displayName}: preferred table "${anchor.tablePreference}" is full. Finding alternative.`);
          targetTable = undefined;
        }
      }

      if (!targetTable) {
        // Find a table with enough room for the group
        const groupSize = members.filter((m) => unseatedSet.has(m.guestId)).length;
        targetTable = tableStates
          .filter(hasRoom)
          .sort((a, b) => {
            // Prefer tables that can fit the whole group
            const aFits = getRemainingCapacity(a) >= groupSize ? 1 : 0;
            const bFits = getRemainingCapacity(b) >= groupSize ? 1 : 0;
            if (aFits !== bFits) return bFits - aFits;
            return getRemainingCapacity(b) - getRemainingCapacity(a);
          })[0];
      }

      if (targetTable) {
        const placed = placeGuest(anchor.id, targetTable, `Anchor for group "${group.name}" (${anchorMembership.role})`);
        if (placed) {
          log.push(`Placed anchor ${anchor.displayName} at ${targetTable.tableName} for group "${group.name}".`);
        }
      } else {
        log.push(`No available table for anchor ${anchor.displayName} of group "${group.name}".`);
      }
    }
  }

  // ── Pass 2: Fill relationship group members at their anchor's table ──
  log.push('--- Pass 2: Filling relationship group members ---');

  for (const group of eventGroups) {
    const members = membershipsByGroup.get(group.id) ?? [];

    // Find which table(s) the anchor(s) are at
    const anchorTableIds = new Set<string>();
    for (const m of members) {
      if (isAnchorRole(m.role) || (guestById.get(m.guestId) && ANCHOR_CATEGORIES.includes(normalizeGuestCategory(guestById.get(m.guestId)!.category) as GuestCategory))) {
        // Check if this anchor is already seated
        for (const ts of tableStates) {
          if (ts.seated.has(m.guestId)) {
            anchorTableIds.add(ts.tableId);
          }
        }
      }
    }

    // Determine primary table for this group
    let primaryTable: TableState | undefined;
    if (anchorTableIds.size > 0) {
      const primaryId = [...anchorTableIds][0];
      primaryTable = getTableById(tableStates, primaryId);
    }

    // Place remaining members
    for (const m of members) {
      if (!unseatedSet.has(m.guestId)) continue;
      const guest = guestById.get(m.guestId);
      if (!guest) continue;

      let targetTable = primaryTable && hasRoom(primaryTable) ? primaryTable : undefined;
      if (!targetTable) {
        // Try any anchor table
        for (const tid of anchorTableIds) {
          const ts = getTableById(tableStates, tid);
          if (ts && hasRoom(ts)) {
            targetTable = ts;
            break;
          }
        }
      }
      if (!targetTable) {
        targetTable = findBestAvailableTable(tableStates);
      }

      if (targetTable) {
        const placed = placeGuest(guest.id, targetTable, `Member of group "${group.name}" (${m.role})`);
        if (placed) {
          log.push(`Placed ${guest.displayName} at ${targetTable.tableName} with group "${group.name}".`);
        }
      } else {
        log.push(`No room for ${guest.displayName} from group "${group.name}".`);
      }
    }
  }

  // ── Pass 3: Category DISTRIBUTION (not clustering!) ──
  log.push('--- Pass 3: Category distribution (spreading donors, staff, officials across tables) ---');

  // The goal is to DISTRIBUTE donors, staff, officials, and VIPs across tables
  // so each table has a mix. Never bunch all donors or all students at one table.

  // Categories we want to spread evenly — can be overridden by disperseCategories param
  const SPREAD_CATEGORIES = disperseCategories
    ? new Set<GuestCategory>(disperseCategories as GuestCategory[])
    : new Set<GuestCategory>(['donor', 'sponsor', 'board_member', 'vip', 'staff']);

  if (strategy) {
    log.push(`Strategy hint: "${strategy}"`);
  }
  const STUDENT_CATEGORIES = new Set<GuestCategory>(['scholarship_recipient']);

  // 3a: Distribute donors/staff/VIPs using round-robin across tables
  const spreadGuests = eligibleGuests.filter(
    (g) => unseatedSet.has(g.id) && SPREAD_CATEGORIES.has(normalizeGuestCategory(g.category) as GuestCategory),
  );

  if (spreadGuests.length > 0) {
    log.push(`Distributing ${spreadGuests.length} donors/staff/VIP guests across tables.`);
    const availableTables = tableStates.filter(hasRoom);
    let tableIndex = 0;

    for (const guest of spreadGuests) {
      if (!unseatedSet.has(guest.id)) continue;

      let targetTable: TableState | undefined;
      if (guest.tablePreference) {
        targetTable = getTableByName(tableStates, guest.tablePreference);
        if (targetTable && !hasRoom(targetTable)) targetTable = undefined;
      }
      if (!targetTable) {
        // Round-robin: place each donor/staff at a different table
        let attempts = 0;
        while (attempts < availableTables.length) {
          const candidate = availableTables[tableIndex % availableTables.length];
          tableIndex++;
          if (hasRoom(candidate)) {
            targetTable = candidate;
            break;
          }
          attempts++;
        }
      }

      if (targetTable) {
        placeGuest(guest.id, targetTable, `Distributed ${guest.category} (spread across tables)`);
        log.push(`Distributed ${guest.category} ${guest.displayName} to ${targetTable.tableName}.`);
      }
    }
  }

  // 3b: Distribute students across tables, preferring tables that already have a donor/staff
  const studentGuests = eligibleGuests.filter(
    (g) => unseatedSet.has(g.id) && STUDENT_CATEGORIES.has(normalizeGuestCategory(g.category) as GuestCategory),
  );

  if (studentGuests.length > 0) {
    log.push(`Distributing ${studentGuests.length} students, preferring tables with donors/staff.`);

    for (const guest of studentGuests) {
      if (!unseatedSet.has(guest.id)) continue;

      // Prefer tables that have at least one donor/staff but fewest students
      const targetTable = tableStates
        .filter(hasRoom)
        .sort((a, b) => {
          // Count donors/staff at each table
          let aDonors = 0, bDonors = 0, aStudents = 0, bStudents = 0;
          for (const gId of a.seated) {
            const g = guestById.get(gId);
            if (g && SPREAD_CATEGORIES.has(normalizeGuestCategory(g.category) as GuestCategory)) aDonors++;
            if (g && STUDENT_CATEGORIES.has(normalizeGuestCategory(g.category) as GuestCategory)) aStudents++;
          }
          for (const gId of b.seated) {
            const g = guestById.get(gId);
            if (g && SPREAD_CATEGORIES.has(normalizeGuestCategory(g.category) as GuestCategory)) bDonors++;
            if (g && STUDENT_CATEGORIES.has(normalizeGuestCategory(g.category) as GuestCategory)) bStudents++;
          }
          // Prefer tables with donors but fewer students
          const aScore = (aDonors > 0 ? 100 : 0) - aStudents * 10;
          const bScore = (bDonors > 0 ? 100 : 0) - bStudents * 10;
          return bScore - aScore;
        })[0];

      if (targetTable) {
        placeGuest(guest.id, targetTable, `Student placed with donors/staff`);
        log.push(`Placed student ${guest.displayName} at ${targetTable.tableName}.`);
      }
    }
  }

  // 3b: Families together via householdId
  const householdGroups = new Map<string, Guest[]>();
  for (const guest of eligibleGuests) {
    if (guest.householdId && unseatedSet.has(guest.id)) {
      if (!householdGroups.has(guest.householdId)) {
        householdGroups.set(guest.householdId, []);
      }
      householdGroups.get(guest.householdId)!.push(guest);
    }
  }

  for (const [householdId, familyMembers] of householdGroups) {
    if (familyMembers.length === 0) continue;

    // Find a table that can fit the family
    const targetTable = tableStates
      .filter((t) => getRemainingCapacity(t) >= familyMembers.filter((m) => unseatedSet.has(m.id)).length)
      .sort((a, b) => getRemainingCapacity(a) - getRemainingCapacity(b))[0]
      ?? findBestAvailableTable(tableStates);

    if (targetTable) {
      for (const member of familyMembers) {
        if (unseatedSet.has(member.id) && hasRoom(targetTable)) {
          placeGuest(member.id, targetTable, `Family clustering (household ${householdId})`);
          log.push(`Placed family member ${member.displayName} at ${targetTable.tableName}.`);
        }
      }
    }
  }

  // 3c: Plus-ones adjacent to their primary guest
  const plusOneGuests = eligibleGuests.filter(
    (g) => unseatedSet.has(g.id) && g.plusOneId,
  );

  for (const guest of plusOneGuests) {
    if (!unseatedSet.has(guest.id)) continue;

    // Find where the primary guest is seated
    let primaryTable: TableState | undefined;
    for (const ts of tableStates) {
      if (ts.seated.has(guest.plusOneId!)) {
        primaryTable = ts;
        break;
      }
    }

    if (primaryTable && hasRoom(primaryTable)) {
      placeGuest(guest.id, primaryTable, `Plus-one adjacent to primary guest`);
      log.push(`Placed plus-one ${guest.displayName} at ${primaryTable.tableName}.`);
    }
  }

  // ── Pass 4: Balanced fill of remaining guests ──
  log.push('--- Pass 4: Balanced fill of remaining guests ---');

  const remaining = eligibleGuests.filter((g) => unseatedSet.has(g.id));
  log.push(`${remaining.length} guests remaining after relationship and category passes.`);

  // Sort remaining by party size descending (larger parties first for better fit)
  remaining.sort((a, b) => b.partySize - a.partySize);

  for (const guest of remaining) {
    if (!unseatedSet.has(guest.id)) continue;

    // Respect table preference
    let targetTable: TableState | undefined;
    if (guest.tablePreference) {
      targetTable = getTableByName(tableStates, guest.tablePreference);
      if (targetTable && !hasRoom(targetTable)) targetTable = undefined;
    }

    if (!targetTable) {
      // Find the table with most room to balance utilization
      targetTable = tableStates
        .filter(hasRoom)
        .sort((a, b) => {
          // Prefer tables that are partially filled (avoid empty tables when possible)
          const aUtil = a.seated.size / a.capacity;
          const bUtil = b.seated.size / b.capacity;
          // Target ~60-80% utilization: prefer tables closer to this range
          const aScore = Math.abs(aUtil - 0.6);
          const bScore = Math.abs(bUtil - 0.6);
          return aScore - bScore;
        })[0];
    }

    if (!targetTable) {
      // Fallback: any table with room
      targetTable = findBestAvailableTable(tableStates);
    }

    if (targetTable) {
      placeGuest(guest.id, targetTable, 'Balanced fill');
      log.push(`Placed ${guest.displayName} at ${targetTable.tableName} (balanced fill).`);
    } else {
      log.push(`No room available for ${guest.displayName}.`);
    }
  }

  // ── Pass 5: Score the arrangement ──
  log.push('--- Pass 5: Scoring arrangement ---');

  // Combine existing + new assignments for scoring
  const allAssignedGuestIds = new Set([
    ...alreadySeated,
    ...newAssignments.map((a) => a.guestId),
  ]);

  const score = computeScore(
    tableStates,
    guests,
    guestById,
    allAssignedGuestIds,
    relationshipGroups,
    membershipsByGroup,
    membershipsByGuest,
    log,
  );

  // Build summary
  const tablesUsed = tableStates.filter((t) => t.seated.size > 0).length;

  let groupsFullySeated = 0;
  let groupsPartiallySplit = 0;

  for (const group of eventGroups) {
    const members = membershipsByGroup.get(group.id) ?? [];
    const memberGuestIds = members.map((m) => m.guestId);
    const seatedMembers = memberGuestIds.filter((id) => allAssignedGuestIds.has(id));

    if (seatedMembers.length === 0) continue;

    // Check if all seated members are at the same table
    const memberTables = new Set<string>();
    for (const ts of tableStates) {
      for (const gId of seatedMembers) {
        if (ts.seated.has(gId)) {
          memberTables.add(ts.tableId);
        }
      }
    }

    if (seatedMembers.length === memberGuestIds.length && memberTables.size === 1) {
      groupsFullySeated++;
    } else if (memberTables.size > 1) {
      groupsPartiallySplit++;
    }
  }

  const totalSeated = newAssignments.length;
  const totalUnseated = eligibleGuests.length - totalSeated;

  log.push(`Proposal complete: ${totalSeated} newly seated, ${totalUnseated} could not be placed.`);
  log.push(`Score: ${score.overall}/100 (relationships: ${score.relationshipSatisfaction}, clustering: ${score.categoryClustering}, balance: ${score.utilizationBalance}, preferences: ${score.preferenceSatisfaction}).`);

  return {
    assignments: newAssignments,
    score,
    summary: {
      totalSeated,
      totalUnseated,
      groupsFullySeated,
      groupsPartiallySplit,
      tablesUsed,
    },
    log,
  };
}

// ---------------------------------------------------------------------------
// Score Computation (shared)
// ---------------------------------------------------------------------------

function computeScore(
  tableStates: TableState[],
  guests: Guest[],
  guestById: Map<string, Guest>,
  allAssignedGuestIds: Set<string>,
  relationshipGroups: RelationshipGroup[],
  membershipsByGroup: Map<string, RelationshipMembership[]>,
  membershipsByGuest: Map<string, RelationshipMembership[]>,
  log: string[],
): SeatingScore {
  // --- Relationship satisfaction ---
  // For each group, what fraction of members share the same table?
  let totalGroupScore = 0;
  let groupCount = 0;

  for (const group of relationshipGroups) {
    const members = membershipsByGroup.get(group.id) ?? [];
    const memberGuestIds = members.map((m) => m.guestId).filter((id) => guestById.has(id));
    if (memberGuestIds.length < 2) continue;

    groupCount++;
    const seatedMembers = memberGuestIds.filter((id) => allAssignedGuestIds.has(id));
    if (seatedMembers.length === 0) continue;

    // Find which tables they are at
    const tableCounts = new Map<string, number>();
    for (const ts of tableStates) {
      let count = 0;
      for (const gId of seatedMembers) {
        if (ts.seated.has(gId)) count++;
      }
      if (count > 0) tableCounts.set(ts.tableId, count);
    }

    // Best case: all at one table
    const maxAtOneTable = Math.max(...tableCounts.values(), 0);
    const groupSatisfaction = seatedMembers.length > 0
      ? maxAtOneTable / seatedMembers.length
      : 0;
    totalGroupScore += groupSatisfaction;
  }

  const relationshipSatisfaction = groupCount > 0
    ? clamp100((totalGroupScore / groupCount) * 100)
    : 100;

  // --- Category distribution ---
  // How well are donors/staff/VIPs spread across tables? Penalize bunching.
  // A table that's 100% donors scores 0. Even distribution scores 100.
  const SPREAD_CATS = new Set(['donor', 'sponsor', 'board_member', 'vip', 'staff']);
  let distributionScore = 0;
  let tablesWithGuests = 0;

  for (const ts of tableStates) {
    if (ts.seated.size === 0) continue;
    tablesWithGuests++;

    let spreadCount = 0;
    let totalCount = 0;
    for (const gId of ts.seated) {
      const guest = guestById.get(gId);
      if (!guest) continue;
      totalCount++;
      if (SPREAD_CATS.has(normalizeGuestCategory(guest.category))) spreadCount++;
    }

    if (totalCount === 0) continue;

    // Ideal: each table has 1-2 donors/staff out of 8-10 guests (10-25%)
    // Terrible: table is 100% donors
    const ratio = spreadCount / totalCount;
    // Score peaks when ratio is 0.1-0.3, drops sharply above 0.5
    let tableScore: number;
    if (ratio <= 0.3) {
      tableScore = 100; // ideal mix
    } else if (ratio <= 0.5) {
      tableScore = 100 - (ratio - 0.3) * 250; // drops to 50 at 0.5
    } else {
      tableScore = Math.max(0, 50 - (ratio - 0.5) * 100); // drops to 0 at 1.0
    }
    distributionScore += tableScore;
  }

  const categoryClustering = tablesWithGuests > 0
    ? clamp100(distributionScore / tablesWithGuests)
    : 100;

  // --- Utilization balance ---
  // How evenly are tables filled? Low variance = high score.
  const activeTables = tableStates.filter((t) => t.capacity > 0);
  if (activeTables.length === 0) {
    return { overall: 0, relationshipSatisfaction: 0, categoryClustering: 0, utilizationBalance: 0, preferenceSatisfaction: 0 };
  }

  const utilizations = activeTables.map((t) => t.seated.size / t.capacity);
  const avgUtil = utilizations.reduce((a, b) => a + b, 0) / utilizations.length;
  const variance = utilizations.reduce((sum, u) => sum + Math.pow(u - avgUtil, 2), 0) / utilizations.length;
  // Perfect balance = 0 variance, worst = 0.25 (half full, half empty)
  const utilizationBalance = clamp100((1 - variance / 0.25) * 100);

  // --- Preference satisfaction ---
  // How many guests with a tablePreference actually got their preferred table?
  let prefSatisfied = 0;
  let prefTotal = 0;

  for (const ts of tableStates) {
    for (const gId of ts.seated) {
      const guest = guestById.get(gId);
      if (!guest || !guest.tablePreference) continue;
      prefTotal++;
      if (ts.tableName.toLowerCase() === guest.tablePreference.trim().toLowerCase()) {
        prefSatisfied++;
      }
    }
  }

  const preferenceSatisfaction = prefTotal > 0
    ? clamp100((prefSatisfied / prefTotal) * 100)
    : 100;

  // --- Overall (weighted) ---
  const overall = clamp100(
    relationshipSatisfaction * 0.35 +
    categoryClustering * 0.2 +
    utilizationBalance * 0.25 +
    preferenceSatisfaction * 0.2,
  );

  log.push(`Relationship satisfaction: ${relationshipSatisfaction}% (${groupCount} groups evaluated).`);
  log.push(`Category clustering: ${categoryClustering}% (${categoryCount} categories evaluated).`);
  log.push(`Utilization balance: ${utilizationBalance}% (avg ${Math.round(avgUtil * 100)}%).`);
  log.push(`Preference satisfaction: ${preferenceSatisfaction}% (${prefSatisfied}/${prefTotal} satisfied).`);

  return { overall, relationshipSatisfaction, categoryClustering, utilizationBalance, preferenceSatisfaction };
}

// ---------------------------------------------------------------------------
// 2. scoreExistingSeating
// ---------------------------------------------------------------------------

/**
 * Score the current seating arrangement without making any changes.
 */
export function scoreExistingSeating(params: ProposalParams): SeatingScore {
  const {
    tables,
    guests,
    existingAssignments,
    relationshipGroups,
    relationshipMemberships,
    versionId,
  } = params;

  const tableStates = buildTableStates(tables, versionId);
  const guestById = new Map(guests.map((g) => [g.id, g]));

  const versionAssignments = existingAssignments.filter((a) => a.versionId === versionId);
  const allAssignedGuestIds = new Set<string>();

  for (const assignment of versionAssignments) {
    const tableState = getTableById(tableStates, assignment.tableId);
    if (tableState) {
      tableState.seated.add(assignment.guestId);
      allAssignedGuestIds.add(assignment.guestId);
    }
  }

  const membershipsByGroup = new Map<string, RelationshipMembership[]>();
  for (const m of relationshipMemberships) {
    if (!membershipsByGroup.has(m.groupId)) {
      membershipsByGroup.set(m.groupId, []);
    }
    membershipsByGroup.get(m.groupId)!.push(m);
  }

  const membershipsByGuest = new Map<string, RelationshipMembership[]>();
  for (const m of relationshipMemberships) {
    if (!membershipsByGuest.has(m.guestId)) {
      membershipsByGuest.set(m.guestId, []);
    }
    membershipsByGuest.get(m.guestId)!.push(m);
  }

  const log: string[] = [];
  return computeScore(
    tableStates,
    guests,
    guestById,
    allAssignedGuestIds,
    relationshipGroups,
    membershipsByGroup,
    membershipsByGuest,
    log,
  );
}

// ---------------------------------------------------------------------------
// 3. getSeatingRecommendations
// ---------------------------------------------------------------------------

/**
 * Return prioritized individual seating recommendations for unseated guests.
 */
export function getSeatingRecommendations(
  params: ProposalParams,
): Array<{ guestId: string; tableId: string; reason: string; priority: 'critical' | 'high' | 'medium' | 'low' }> {
  const {
    tables,
    guests,
    existingAssignments,
    relationshipGroups,
    relationshipMemberships,
    versionId,
  } = params;

  const tableStates = buildTableStates(tables, versionId);
  const guestById = new Map(guests.map((g) => [g.id, g]));

  // Load existing assignments into table states
  const versionAssignments = existingAssignments.filter((a) => a.versionId === versionId);
  const alreadySeated = new Set<string>();

  for (const assignment of versionAssignments) {
    const tableState = getTableById(tableStates, assignment.tableId);
    if (tableState) {
      tableState.seated.add(assignment.guestId);
      alreadySeated.add(assignment.guestId);
    }
  }

  // Index memberships
  const membershipsByGroup = new Map<string, RelationshipMembership[]>();
  for (const m of relationshipMemberships) {
    if (!membershipsByGroup.has(m.groupId)) {
      membershipsByGroup.set(m.groupId, []);
    }
    membershipsByGroup.get(m.groupId)!.push(m);
  }

  const membershipsByGuest = new Map<string, RelationshipMembership[]>();
  for (const m of relationshipMemberships) {
    if (!membershipsByGuest.has(m.guestId)) {
      membershipsByGuest.set(m.guestId, []);
    }
    membershipsByGuest.get(m.guestId)!.push(m);
  }

  const recommendations: Array<{
    guestId: string;
    tableId: string;
    reason: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    score: number;
  }> = [];

  // Find unseated confirmed guests
  const unseated = guests.filter(
    (g) =>
      !alreadySeated.has(g.id) &&
      (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in'),
  );

  for (const guest of unseated) {
    // Determine priority
    let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    let score = 50;

    if (VIP_TIER_CATEGORIES.has(normalizeGuestCategory(guest.category) as GuestCategory)) {
      priority = 'critical';
      score = 95;
    } else if (normalizeGuestCategory(guest.category) === 'scholarship_recipient') {
      priority = 'high';
      score = 75;
    } else if (guest.category === 'family') {
      priority = 'medium';
      score = 60;
    } else {
      priority = 'low';
      score = 40;
    }

    // Find the best table for this guest
    let bestTable: TableState | undefined;
    let reason = '';

    // Check if they belong to a relationship group with seated members
    const guestMemberships = membershipsByGuest.get(guest.id) ?? [];
    for (const membership of guestMemberships) {
      const groupMembers = membershipsByGroup.get(membership.groupId) ?? [];
      for (const gm of groupMembers) {
        if (gm.guestId === guest.id) continue;
        for (const ts of tableStates) {
          if (ts.seated.has(gm.guestId) && hasRoom(ts)) {
            const group = relationshipGroups.find((g) => g.id === membership.groupId);
            bestTable = ts;
            reason = `Seat with ${guestById.get(gm.guestId)?.displayName ?? 'group member'} at ${ts.tableName} (group: ${group?.name ?? 'Unknown'})`;
            score += 20;
            break;
          }
        }
        if (bestTable) break;
      }
      if (bestTable) break;
    }

    // Check plus-one
    if (!bestTable && guest.plusOneId) {
      for (const ts of tableStates) {
        if (ts.seated.has(guest.plusOneId) && hasRoom(ts)) {
          bestTable = ts;
          reason = `Seat with plus-one at ${ts.tableName}`;
          score += 15;
          break;
        }
      }
    }

    // Check household
    if (!bestTable && guest.householdId) {
      const householdMembers = guests.filter(
        (g) => g.householdId === guest.householdId && g.id !== guest.id,
      );
      for (const hm of householdMembers) {
        for (const ts of tableStates) {
          if (ts.seated.has(hm.id) && hasRoom(ts)) {
            bestTable = ts;
            reason = `Seat with household member ${hm.displayName} at ${ts.tableName}`;
            score += 10;
            break;
          }
        }
        if (bestTable) break;
      }
    }

    // Table preference
    if (!bestTable && guest.tablePreference) {
      const prefTable = getTableByName(tableStates, guest.tablePreference);
      if (prefTable && hasRoom(prefTable)) {
        bestTable = prefTable;
        reason = `Preferred table "${guest.tablePreference}"`;
        score += 10;
      }
    }

    // Fallback
    if (!bestTable) {
      bestTable = findBestAvailableTable(tableStates);
      if (bestTable) {
        reason = `Best available table (${bestTable.tableName})`;
      }
    }

    if (bestTable) {
      // Re-evaluate priority based on final score
      if (score >= 90) priority = 'critical';
      else if (score >= 70) priority = 'high';
      else if (score >= 50) priority = 'medium';

      recommendations.push({
        guestId: guest.id,
        tableId: bestTable.tableId,
        reason,
        priority,
        score,
      });
    }
  }

  // Sort by score descending
  recommendations.sort((a, b) => b.score - a.score);

  // Return without the internal score field
  return recommendations.map(({ guestId, tableId, reason, priority }) => ({
    guestId,
    tableId,
    reason,
    priority,
  }));
}
