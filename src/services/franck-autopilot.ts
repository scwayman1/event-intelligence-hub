/**
 * Franck Auto-Pilot — Continuous Seating Refinement Engine
 *
 * Algorithmically optimizes seating arrangements through iterative
 * swap-based hill climbing. No LLM calls — pure computation.
 *
 * The loop:
 *   1. Score the current arrangement
 *   2. Identify candidate swaps between tables
 *   3. Evaluate each swap's impact on the score
 *   4. Apply the best-improving swap
 *   5. Repeat until score plateaus or max iterations reached
 */

import { useEventStore } from '@/data/store';
import {
  scoreExistingSeating,
  type SeatingScore,
} from '@/services/smart-seating';
import type {
  Guest,
  LayoutObject,
  SeatingAssignment,
  RelationshipGroup,
  RelationshipMembership,
} from '@/types/events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefinementProgress {
  iteration: number;
  maxIterations: number;
  currentScore: number;
  bestScore: number;
  lastSwap: string | null;
  phase: 'scoring' | 'evaluating' | 'applying' | 'done';
}

export interface RefinementResult {
  initialScore: SeatingScore;
  finalScore: SeatingScore;
  delta: number;
  iterations: number;
  swapsApplied: Array<{
    guest1Name: string;
    guest1Table: string;
    guest2Name: string;
    guest2Table: string;
    scoreBefore: number;
    scoreAfter: number;
  }>;
  unseatedPlaced: Array<{
    guestName: string;
    tableName: string;
  }>;
  plateauReached: boolean;
}

// ---------------------------------------------------------------------------
// Context builder (same pattern as franck-tools.ts)
// ---------------------------------------------------------------------------

function getEventContext(eventId: string) {
  const state = useEventStore.getState();
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

  return { event, guests, versions, activeVersion, versionId, tables, assignments, groups, memberships };
}

// ---------------------------------------------------------------------------
// Score helper — uses fresh store state
// ---------------------------------------------------------------------------

function currentScore(eventId: string): SeatingScore | null {
  const ctx = getEventContext(eventId);
  if (!ctx || ctx.assignments.length === 0) return null;

  return scoreExistingSeating({
    tables: ctx.tables,
    guests: ctx.guests,
    existingAssignments: ctx.assignments,
    relationshipGroups: ctx.groups,
    relationshipMemberships: ctx.memberships,
    versionId: ctx.versionId,
  });
}

// ---------------------------------------------------------------------------
// Swap evaluator — simulates a swap without mutating the store
// ---------------------------------------------------------------------------

function evaluateSwap(
  guestId1: string,
  guestId2: string,
  tables: LayoutObject[],
  guests: Guest[],
  assignments: SeatingAssignment[],
  groups: RelationshipGroup[],
  memberships: RelationshipMembership[],
  versionId: string,
): SeatingScore | null {
  const a1 = assignments.find((a) => a.guestId === guestId1 && a.versionId === versionId);
  const a2 = assignments.find((a) => a.guestId === guestId2 && a.versionId === versionId);
  if (!a1 || !a2) return null;
  if (a1.tableId === a2.tableId) return null; // same table, no point

  // Create a virtual assignment list with the swap applied
  const swapped = assignments.map((a) => {
    if (a.id === a1.id) return { ...a, tableId: a2.tableId, seatNumber: a2.seatNumber };
    if (a.id === a2.id) return { ...a, tableId: a1.tableId, seatNumber: a1.seatNumber };
    return a;
  });

  return scoreExistingSeating({
    tables,
    guests,
    existingAssignments: swapped,
    relationshipGroups: groups,
    relationshipMemberships: memberships,
    versionId,
  });
}

// ---------------------------------------------------------------------------
// Evaluate placing an unseated guest at a table (virtual)
// ---------------------------------------------------------------------------

function evaluatePlacement(
  guestId: string,
  tableId: string,
  tables: LayoutObject[],
  guests: Guest[],
  assignments: SeatingAssignment[],
  groups: RelationshipGroup[],
  memberships: RelationshipMembership[],
  versionId: string,
): SeatingScore | null {
  // Check table has room
  const table = tables.find((t) => t.id === tableId);
  if (!table) return null;
  const seated = assignments.filter((a) => a.tableId === tableId && a.versionId === versionId).length;
  if (seated >= (table.capacity || 8)) return null;

  const virtualAssignment: SeatingAssignment = {
    id: `virtual-${guestId}`,
    versionId,
    guestId,
    tableId,
    seatNumber: seated + 1,
  };

  return scoreExistingSeating({
    tables,
    guests,
    existingAssignments: [...assignments, virtualAssignment],
    relationshipGroups: groups,
    relationshipMemberships: memberships,
    versionId,
  });
}

// ---------------------------------------------------------------------------
// Main refinement loop
// ---------------------------------------------------------------------------

export async function runRefinementLoop(
  eventId: string,
  maxIterations: number = 20,
  onProgress?: (progress: RefinementProgress) => void,
): Promise<RefinementResult> {
  const ctx = getEventContext(eventId);
  if (!ctx) {
    throw new Error(`Event "${eventId}" not found.`);
  }

  if (ctx.tables.length === 0) {
    throw new Error('No tables found in the active layout. Add tables first.');
  }

  const store = useEventStore.getState();
  const guestById = new Map(ctx.guests.map((g) => [g.id, g]));
  const tableById = new Map(ctx.tables.map((t) => [t.id, t]));

  // --- Phase 0: Score the initial arrangement ---
  const initialScore = currentScore(eventId) ?? {
    overall: 0,
    relationshipSatisfaction: 0,
    categoryClustering: 0,
    utilizationBalance: 0,
    preferenceSatisfaction: 0,
  };

  const result: RefinementResult = {
    initialScore,
    finalScore: initialScore,
    delta: 0,
    iterations: 0,
    swapsApplied: [],
    unseatedPlaced: [],
    plateauReached: false,
  };

  // --- Phase 1: Place unseated confirmed guests first ---
  {
    const freshCtx = getEventContext(eventId)!;
    const seatedIds = new Set(freshCtx.assignments.map((a) => a.guestId));
    const unseated = freshCtx.guests.filter(
      (g) =>
        !seatedIds.has(g.id) &&
        (g.rsvpStatus === 'confirmed' || g.rsvpStatus === 'checked_in'),
    );

    for (const guest of unseated) {
      let bestTableId: string | null = null;
      let bestPlacementScore = -1;

      // Re-read assignments fresh for each placement
      const latestCtx = getEventContext(eventId)!;

      for (const table of latestCtx.tables) {
        const score = evaluatePlacement(
          guest.id,
          table.id,
          latestCtx.tables,
          latestCtx.guests,
          latestCtx.assignments,
          latestCtx.groups,
          latestCtx.memberships,
          latestCtx.versionId,
        );
        if (score && score.overall > bestPlacementScore) {
          bestPlacementScore = score.overall;
          bestTableId = table.id;
        }
      }

      if (bestTableId) {
        store.moveGuestToTable(guest.id, bestTableId, freshCtx.versionId);
        const tableName = tableById.get(bestTableId)?.name ?? 'Unknown';
        result.unseatedPlaced.push({
          guestName: guest.displayName,
          tableName,
        });
      }
    }
  }

  // --- Phase 2: Iterative swap-based hill climbing ---
  let consecutiveNoImprovement = 0;
  const MAX_PLATEAU = 3; // stop after 3 consecutive iterations with no improvement

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    result.iterations = iteration + 1;

    // Report progress
    if (onProgress) {
      const curScore = currentScore(eventId);
      onProgress({
        iteration: iteration + 1,
        maxIterations,
        currentScore: curScore?.overall ?? 0,
        bestScore: curScore?.overall ?? 0,
        lastSwap: result.swapsApplied.length > 0
          ? result.swapsApplied[result.swapsApplied.length - 1].guest1Name +
            ' <-> ' +
            result.swapsApplied[result.swapsApplied.length - 1].guest2Name
          : null,
        phase: 'evaluating',
      });
    }

    // Get fresh state
    const freshCtx = getEventContext(eventId)!;
    const seatedGuests = freshCtx.assignments
      .filter((a) => a.versionId === freshCtx.versionId)
      .map((a) => a.guestId);

    if (seatedGuests.length < 2) break;

    const baseScore = currentScore(eventId);
    if (!baseScore) break;

    // Evaluate candidate swaps — sample pairs to keep it fast
    let bestSwapScore = baseScore.overall;
    let bestSwapPair: [string, string] | null = null;
    let bestSwapResult: SeatingScore | null = null;

    // Build candidate pairs: guests at different tables
    // For performance, limit to a reasonable number of candidates
    const MAX_CANDIDATES = 200;
    const pairs: [string, string][] = [];

    // Strategy: for each relationship group, try swapping separated members
    // closer to their group mates
    const membershipsByGuest = new Map<string, string[]>();
    for (const m of freshCtx.memberships) {
      if (!membershipsByGuest.has(m.guestId)) {
        membershipsByGuest.set(m.guestId, []);
      }
      membershipsByGuest.get(m.guestId)!.push(m.groupId);
    }

    const membershipsByGroup = new Map<string, string[]>();
    for (const m of freshCtx.memberships) {
      if (!membershipsByGroup.has(m.groupId)) {
        membershipsByGroup.set(m.groupId, []);
      }
      membershipsByGroup.get(m.groupId)!.push(m.guestId);
    }

    // Find guests who are separated from their group
    const assignmentByGuest = new Map<string, SeatingAssignment>();
    for (const a of freshCtx.assignments) {
      if (a.versionId === freshCtx.versionId) {
        assignmentByGuest.set(a.guestId, a);
      }
    }

    // Smart candidate generation: for each group member not at the
    // majority table, try swapping them with someone at the majority table
    for (const group of freshCtx.groups) {
      const groupGuestIds = membershipsByGroup.get(group.id) ?? [];
      const seatedGroupGuests = groupGuestIds.filter((id) => assignmentByGuest.has(id));
      if (seatedGroupGuests.length < 2) continue;

      // Find which table has the most group members
      const tableCount = new Map<string, number>();
      for (const gId of seatedGroupGuests) {
        const a = assignmentByGuest.get(gId)!;
        tableCount.set(a.tableId, (tableCount.get(a.tableId) ?? 0) + 1);
      }

      let majorityTableId = '';
      let majorityCount = 0;
      for (const [tid, count] of tableCount) {
        if (count > majorityCount) {
          majorityCount = count;
          majorityTableId = tid;
        }
      }

      // For each group member NOT at the majority table, try swapping with
      // a non-group-member AT the majority table
      for (const gId of seatedGroupGuests) {
        const a = assignmentByGuest.get(gId)!;
        if (a.tableId === majorityTableId) continue;

        // Find non-group-members at the majority table
        const atMajority = freshCtx.assignments.filter(
          (sa) => sa.tableId === majorityTableId && sa.versionId === freshCtx.versionId,
        );
        for (const target of atMajority) {
          if (seatedGroupGuests.includes(target.guestId)) continue;
          pairs.push([gId, target.guestId]);
          if (pairs.length >= MAX_CANDIDATES) break;
        }
        if (pairs.length >= MAX_CANDIDATES) break;
      }
      if (pairs.length >= MAX_CANDIDATES) break;
    }

    // Also add some random pairs for diversity if we have room
    if (pairs.length < MAX_CANDIDATES && seatedGuests.length > 1) {
      const remaining = MAX_CANDIDATES - pairs.length;
      const existingPairSet = new Set(pairs.map(([a, b]) => `${a}:${b}`));

      for (let i = 0; i < remaining && i < seatedGuests.length * 2; i++) {
        const idx1 = Math.floor(Math.random() * seatedGuests.length);
        let idx2 = Math.floor(Math.random() * seatedGuests.length);
        if (idx1 === idx2) idx2 = (idx2 + 1) % seatedGuests.length;

        const key = `${seatedGuests[idx1]}:${seatedGuests[idx2]}`;
        const keyRev = `${seatedGuests[idx2]}:${seatedGuests[idx1]}`;
        if (!existingPairSet.has(key) && !existingPairSet.has(keyRev)) {
          pairs.push([seatedGuests[idx1], seatedGuests[idx2]]);
          existingPairSet.add(key);
        }
      }
    }

    // Evaluate all candidate swaps
    for (const [gId1, gId2] of pairs) {
      const swapScore = evaluateSwap(
        gId1,
        gId2,
        freshCtx.tables,
        freshCtx.guests,
        freshCtx.assignments,
        freshCtx.groups,
        freshCtx.memberships,
        freshCtx.versionId,
      );

      if (swapScore && swapScore.overall > bestSwapScore) {
        bestSwapScore = swapScore.overall;
        bestSwapPair = [gId1, gId2];
        bestSwapResult = swapScore;
      }
    }

    // Apply the best swap if it improves the score
    if (bestSwapPair && bestSwapResult && bestSwapScore > baseScore.overall) {
      const [gId1, gId2] = bestSwapPair;
      const a1 = freshCtx.assignments.find((a) => a.guestId === gId1 && a.versionId === freshCtx.versionId)!;
      const a2 = freshCtx.assignments.find((a) => a.guestId === gId2 && a.versionId === freshCtx.versionId)!;

      const guest1 = guestById.get(gId1);
      const guest2 = guestById.get(gId2);
      const table1 = tableById.get(a1.tableId);
      const table2 = tableById.get(a2.tableId);

      // Apply the swap via store mutations
      store.removeSeatingAssignment(a1.id);
      store.removeSeatingAssignment(a2.id);
      store.moveGuestToTable(gId1, a2.tableId, freshCtx.versionId);
      store.moveGuestToTable(gId2, a1.tableId, freshCtx.versionId);

      result.swapsApplied.push({
        guest1Name: guest1?.displayName ?? gId1,
        guest1Table: table2?.name ?? 'Unknown', // where they went
        guest2Name: guest2?.displayName ?? gId2,
        guest2Table: table1?.name ?? 'Unknown',
        scoreBefore: baseScore.overall,
        scoreAfter: bestSwapScore,
      });

      consecutiveNoImprovement = 0;

      if (onProgress) {
        onProgress({
          iteration: iteration + 1,
          maxIterations,
          currentScore: bestSwapScore,
          bestScore: bestSwapScore,
          lastSwap: `${guest1?.displayName ?? gId1} <-> ${guest2?.displayName ?? gId2}`,
          phase: 'applying',
        });
      }
    } else {
      consecutiveNoImprovement++;
      if (consecutiveNoImprovement >= MAX_PLATEAU) {
        result.plateauReached = true;
        break;
      }
    }

    // Yield to the event loop so UI stays responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // --- Final scoring ---
  const finalScore = currentScore(eventId) ?? initialScore;
  result.finalScore = finalScore;
  result.delta = finalScore.overall - initialScore.overall;

  if (onProgress) {
    onProgress({
      iteration: result.iterations,
      maxIterations,
      currentScore: finalScore.overall,
      bestScore: finalScore.overall,
      lastSwap: null,
      phase: 'done',
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Format result in Franck's voice (for chat display)
// ---------------------------------------------------------------------------

export function formatRefinementSummary(result: RefinementResult): string {
  const lines: string[] = [];

  if (result.delta === 0 && result.swapsApplied.length === 0 && result.unseatedPlaced.length === 0) {
    lines.push(
      'Mon dieu! I have examined every possible improvement and — c\'est parfait! — the seating is already at its peak. ' +
      `The arrangement scores ${result.finalScore.overall}/100. Franck approves!`,
    );
    return lines.join('\n\n');
  }

  lines.push(
    `Incroyable! Franck has completed the Auto-Pilot refinement — ${result.iterations} iteration${result.iterations !== 1 ? 's' : ''} of pure genius!`,
  );

  // Score delta
  lines.push(
    `**Score: ${result.initialScore.overall} -> ${result.finalScore.overall}** (${result.delta > 0 ? '+' : ''}${result.delta} points)`,
  );

  // Breakdown
  const fs = result.finalScore;
  lines.push(
    `Breakdown: Relationships ${fs.relationshipSatisfaction}% | Clustering ${fs.categoryClustering}% | Balance ${fs.utilizationBalance}% | Preferences ${fs.preferenceSatisfaction}%`,
  );

  // Unseated placements
  if (result.unseatedPlaced.length > 0) {
    lines.push(
      `**Seated ${result.unseatedPlaced.length} previously unseated guest${result.unseatedPlaced.length !== 1 ? 's' : ''}:**`,
    );
    const placementLines = result.unseatedPlaced.slice(0, 8).map(
      (p) => `  - ${p.guestName} -> ${p.tableName}`,
    );
    if (result.unseatedPlaced.length > 8) {
      placementLines.push(`  - ...and ${result.unseatedPlaced.length - 8} more`);
    }
    lines.push(placementLines.join('\n'));
  }

  // Swaps
  if (result.swapsApplied.length > 0) {
    lines.push(
      `**Applied ${result.swapsApplied.length} strategic swap${result.swapsApplied.length !== 1 ? 's' : ''}:**`,
    );
    const swapLines = result.swapsApplied.slice(0, 6).map(
      (s) => `  - ${s.guest1Name} -> ${s.guest1Table}, ${s.guest2Name} -> ${s.guest2Table} (${s.scoreBefore} -> ${s.scoreAfter})`,
    );
    if (result.swapsApplied.length > 6) {
      swapLines.push(`  - ...and ${result.swapsApplied.length - 6} more swaps`);
    }
    lines.push(swapLines.join('\n'));
  }

  if (result.plateauReached) {
    lines.push(
      'The arrangement has reached its optimal plateau — no further improvements are possible. Magnifique!',
    );
  }

  lines.push(
    'The choreography of human connection has been perfected. Franck does not do mediocre!',
  );

  return lines.join('\n\n');
}
