import type { Guest, SeatingAssignment } from '@/types/events';
import type { TableSummary } from '@/lib/event-analytics';

export interface AutoSeatParams {
  unassignedGuests: Guest[];
  tables: TableSummary[];
  existingAssignments: SeatingAssignment[];
  versionId: string;
}

export interface AutoSeatResult {
  guestId: string;
  tableId: string;
}

/**
 * Intelligent auto-seating algorithm that assigns unassigned guests to tables
 * optimally based on multiple priority factors:
 *
 * 1. Keep households together (same householdId -> same table)
 * 2. Seat VIP/board_member guests at front-zone tables first
 * 3. Seat accessibility-needs guests at accessible/front tables
 * 4. Mix categories for diversity (avoid all-donor or all-staff tables)
 * 5. Fill tables evenly (don't overfill one while others are empty)
 */
export function autoSeatGuests(params: AutoSeatParams): AutoSeatResult[] {
  const { unassignedGuests, tables, existingAssignments, versionId } = params;

  if (unassignedGuests.length === 0 || tables.length === 0) return [];

  // Build mutable state: track available capacity and category mix per table
  const tableState = new Map<
    string,
    {
      summary: TableSummary;
      currentCount: number;
      capacity: number;
      categoryMix: Record<string, number>;
    }
  >();

  for (const table of tables) {
    const assignedCount = existingAssignments.filter(
      (a) => a.tableId === table.tableId && a.versionId === versionId,
    ).length;
    tableState.set(table.tableId, {
      summary: table,
      currentCount: assignedCount,
      capacity: table.capacity,
      categoryMix: { ...table.categoryMix },
    });
  }

  const results: AutoSeatResult[] = [];
  const seated = new Set<string>();

  // Helper: get available space at a table
  function availableSpace(tableId: string): number {
    const state = tableState.get(tableId);
    if (!state) return 0;
    return state.capacity - state.currentCount;
  }

  // Helper: record a guest assignment in local state
  function assignGuest(guestId: string, tableId: string, category: string) {
    results.push({ guestId, tableId });
    seated.add(guestId);
    const state = tableState.get(tableId)!;
    state.currentCount += 1;
    state.categoryMix[category] = (state.categoryMix[category] ?? 0) + 1;
  }

  // Helper: compute a diversity score for placing a guest of a given category
  // at a table. Higher score = more diverse (better).
  function diversityScore(tableId: string, category: string): number {
    const state = tableState.get(tableId);
    if (!state || state.currentCount === 0) return 1;
    const total = state.currentCount;
    const sameCategoryCount = state.categoryMix[category] ?? 0;
    // Ratio of "other" categories -- higher is more diverse
    return 1 - sameCategoryCount / total;
  }

  // Helper: score for even fill -- prefer tables with more space
  function fillScore(tableId: string): number {
    const state = tableState.get(tableId);
    if (!state || state.capacity === 0) return 0;
    return (state.capacity - state.currentCount) / state.capacity;
  }

  // Helper: combined score for a guest-table pairing
  function scoreTable(
    tableId: string,
    guest: Guest,
    options: { preferFront: boolean },
  ): number {
    const state = tableState.get(tableId);
    if (!state) return -Infinity;
    if (availableSpace(tableId) <= 0) return -Infinity;

    let score = 0;

    // Even fill (weight: 3) - strongly prefer emptier tables
    score += fillScore(tableId) * 3;

    // Category diversity (weight: 2) - prefer tables where this category is underrepresented
    score += diversityScore(tableId, guest.category) * 2;

    // Front-zone preference for VIP/board/accessibility (weight: 4)
    if (options.preferFront) {
      if (state.summary.zone === 'front') score += 4;
      else if (state.summary.zone === 'middle') score += 1;
    }

    return score;
  }

  // Helper: pick best table for a guest
  function pickBestTable(
    guest: Guest,
    options: { preferFront: boolean; excludeTableIds?: Set<string> },
  ): string | null {
    let bestId: string | null = null;
    let bestScore = -Infinity;

    for (const [tableId] of tableState) {
      if (options.excludeTableIds?.has(tableId)) continue;
      const s = scoreTable(tableId, guest, options);
      if (s > bestScore) {
        bestScore = s;
        bestId = tableId;
      }
    }

    return bestId;
  }

  // ---- PHASE 1: Group guests by household ----
  const householdGroups = new Map<string, Guest[]>();
  const soloGuests: Guest[] = [];

  for (const guest of unassignedGuests) {
    if (guest.householdId) {
      const group = householdGroups.get(guest.householdId) ?? [];
      group.push(guest);
      householdGroups.set(guest.householdId, group);
    } else {
      soloGuests.push(guest);
    }
  }

  // ---- PHASE 2: Seat household groups together ----
  // Sort households: those with VIP/board/accessibility members go first
  const sortedHouseholds = Array.from(householdGroups.entries()).sort(
    ([, membersA], [, membersB]) => {
      const priorityA = membersA.some(
        (g) =>
          g.category === 'vip' ||
          g.category === 'board_member' ||
          Boolean(g.accessibilityNeeds),
      )
        ? 1
        : 0;
      const priorityB = membersB.some(
        (g) =>
          g.category === 'vip' ||
          g.category === 'board_member' ||
          Boolean(g.accessibilityNeeds),
      )
        ? 1
        : 0;
      return priorityB - priorityA;
    },
  );

  for (const [, members] of sortedHouseholds) {
    const needsFront = members.some(
      (g) =>
        g.category === 'vip' ||
        g.category === 'board_member' ||
        Boolean(g.accessibilityNeeds),
    );

    // Find a table with enough room for the whole household
    let bestTableId: string | null = null;
    let bestScore = -Infinity;

    for (const [tableId] of tableState) {
      if (availableSpace(tableId) < members.length) continue;

      // Score using the first member as representative
      let score = 0;
      score += fillScore(tableId) * 3;

      // Average diversity across members
      const avgDiversity =
        members.reduce((sum, g) => sum + diversityScore(tableId, g.category), 0) /
        members.length;
      score += avgDiversity * 2;

      if (needsFront) {
        const state = tableState.get(tableId)!;
        if (state.summary.zone === 'front') score += 4;
        else if (state.summary.zone === 'middle') score += 1;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTableId = tableId;
      }
    }

    if (bestTableId) {
      for (const member of members) {
        assignGuest(member.id, bestTableId, member.category);
      }
    } else {
      // Can't fit household together; fall back to seating individually
      for (const member of members) {
        soloGuests.push(member);
      }
    }
  }

  // ---- PHASE 3: Seat solo guests by priority tier ----
  // Tier 1: VIP and board_member
  // Tier 2: Accessibility needs
  // Tier 3: Everyone else

  const tier1: Guest[] = [];
  const tier2: Guest[] = [];
  const tier3: Guest[] = [];

  for (const guest of soloGuests) {
    if (seated.has(guest.id)) continue;
    if (guest.category === 'vip' || guest.category === 'board_member') {
      tier1.push(guest);
    } else if (guest.accessibilityNeeds) {
      tier2.push(guest);
    } else {
      tier3.push(guest);
    }
  }

  // Seat VIPs/board members at front tables
  for (const guest of tier1) {
    const tableId = pickBestTable(guest, { preferFront: true });
    if (tableId) assignGuest(guest.id, tableId, guest.category);
  }

  // Seat accessibility-needs guests at front/accessible tables
  for (const guest of tier2) {
    const tableId = pickBestTable(guest, { preferFront: true });
    if (tableId) assignGuest(guest.id, tableId, guest.category);
  }

  // Seat remaining guests with diversity + even fill
  for (const guest of tier3) {
    const tableId = pickBestTable(guest, { preferFront: false });
    if (tableId) assignGuest(guest.id, tableId, guest.category);
  }

  return results;
}
