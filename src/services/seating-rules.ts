/**
 * Seating Rule Constraint Engine
 *
 * Evaluates seating rules (constraints) against the current seating arrangement
 * and suggests fixes for violations.
 */

import type {
  SeatingRule,
  Guest,
  SeatingAssignment,
  LayoutObject,
  SeatingRulePriority,
} from '@/types/events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleViolation {
  ruleId: string;
  ruleDescription: string;
  priority: SeatingRulePriority;
  tableNumber: number;
  details: string;
  affectedGuestIds: string[];
}

export interface SuggestedFix {
  violation: RuleViolation;
  action: string;
  moveGuestId: string;
  fromTableId: string;
  toTableId: string;
}

export interface RuleScoreResult {
  score: number;
  violations: RuleViolation[];
  satisfied: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check whether a guest matches a rule's targeting criteria. */
function guestMatchesTarget(
  guest: Guest,
  rule: SeatingRule,
): boolean {
  if (rule.targetCategory && guest.category !== rule.targetCategory) return false;
  if (rule.targetTag && !(guest.relationshipTags ?? []).some((t) => t.toLowerCase().includes(rule.targetTag!.toLowerCase()))) return false;
  if (rule.targetOrganization && guest.organization?.toLowerCase() !== rule.targetOrganization.toLowerCase()) return false;
  // If no targeting criteria at all, the rule doesn't match anyone specifically
  if (!rule.targetCategory && !rule.targetTag && !rule.targetOrganization) return false;
  return true;
}

/** Check whether a guest matches the secondary category. */
function guestMatchesSecondary(
  guest: Guest,
  rule: SeatingRule,
): boolean {
  if (!rule.secondaryCategory) return false;
  return guest.category === rule.secondaryCategory;
}

/** Build a map from tableId -> list of guests seated there. */
function buildTableGuestMap(
  guests: Guest[],
  assignments: SeatingAssignment[],
): Map<string, Guest[]> {
  const guestMap = new Map<string, Guest>();
  for (const g of guests) guestMap.set(g.id, g);

  const tableGuests = new Map<string, Guest[]>();
  for (const a of assignments) {
    const guest = guestMap.get(a.guestId);
    if (!guest) continue;
    const list = tableGuests.get(a.tableId) ?? [];
    list.push(guest);
    tableGuests.set(a.tableId, list);
  }
  return tableGuests;
}

/** Get the table a guest is assigned to. */
function getGuestTable(
  guestId: string,
  assignments: SeatingAssignment[],
): string | undefined {
  return assignments.find((a) => a.guestId === guestId)?.tableId;
}

// ---------------------------------------------------------------------------
// Rule Evaluation
// ---------------------------------------------------------------------------

/** Evaluate a single rule against current seating. */
export function evaluateRule(
  rule: SeatingRule,
  guests: Guest[],
  assignments: SeatingAssignment[],
  tables: LayoutObject[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const constraintType = rule.constraintType;
  if (!constraintType) return violations;

  const priority = rule.constraintPriority ?? 'preferred';
  const tableGuestMap = buildTableGuestMap(guests, assignments);
  const tableMap = new Map<string, LayoutObject>();
  for (const t of tables) tableMap.set(t.id, t);

  switch (constraintType) {
    case 'different_table': {
      // Guests matching target criteria must NOT share a table
      for (const [tableId, tableGuests] of tableGuestMap) {
        const matching = tableGuests.filter((g) => guestMatchesTarget(g, rule));
        if (matching.length > 1) {
          const table = tableMap.get(tableId);
          violations.push({
            ruleId: rule.id,
            ruleDescription: rule.description,
            priority,
            tableNumber: table?.tableNumber ?? 0,
            details: `Table ${table?.tableNumber ?? '?'} has ${matching.length} ${rule.targetCategory ?? 'matching'} guests together (${matching.map((g) => g.displayName).join(', ')})`,
            affectedGuestIds: matching.map((g) => g.id),
          });
        }
      }
      break;
    }

    case 'same_table': {
      // Guests matching target criteria should be at the same table
      // If secondaryCategory is set, target guests should share a table with secondary guests
      if (rule.secondaryCategory) {
        const targetGuests = guests.filter((g) => guestMatchesTarget(g, rule));
        const secondaryGuests = guests.filter((g) => guestMatchesSecondary(g, rule));

        for (const tg of targetGuests) {
          const tgTable = getGuestTable(tg.id, assignments);
          if (!tgTable) continue;
          const tableGuests = tableGuestMap.get(tgTable) ?? [];
          const hasSecondary = tableGuests.some((g) => guestMatchesSecondary(g, rule));
          if (!hasSecondary && secondaryGuests.length > 0) {
            const table = tableMap.get(tgTable);
            violations.push({
              ruleId: rule.id,
              ruleDescription: rule.description,
              priority,
              tableNumber: table?.tableNumber ?? 0,
              details: `${tg.displayName} (${rule.targetCategory}) at Table ${table?.tableNumber ?? '?'} has no ${rule.secondaryCategory} at their table`,
              affectedGuestIds: [tg.id],
            });
          }
        }
      } else {
        // All matching guests should be at the same table
        const matchingGuests = guests.filter((g) => guestMatchesTarget(g, rule));
        const assignedMatching = matchingGuests.filter((g) =>
          assignments.some((a) => a.guestId === g.id),
        );
        if (assignedMatching.length <= 1) break;

        const tablesUsed = new Set(
          assignedMatching.map((g) => getGuestTable(g.id, assignments)).filter(Boolean),
        );
        if (tablesUsed.size > 1) {
          const tableNums = [...tablesUsed].map((tid) => tableMap.get(tid!)?.tableNumber ?? '?');
          violations.push({
            ruleId: rule.id,
            ruleDescription: rule.description,
            priority,
            tableNumber: 0,
            details: `${rule.targetCategory ?? 'Matching'} guests are split across tables ${tableNums.join(', ')} — rule requires same table`,
            affectedGuestIds: assignedMatching.map((g) => g.id),
          });
        }
      }
      break;
    }

    case 'max_per_table': {
      const maxCount = rule.maxCount ?? 1;
      for (const [tableId, tableGuests] of tableGuestMap) {
        const matching = tableGuests.filter((g) => guestMatchesTarget(g, rule));
        if (matching.length > maxCount) {
          const table = tableMap.get(tableId);
          violations.push({
            ruleId: rule.id,
            ruleDescription: rule.description,
            priority,
            tableNumber: table?.tableNumber ?? 0,
            details: `Table ${table?.tableNumber ?? '?'} has ${matching.length} ${rule.targetCategory ?? 'matching'} guests (max ${maxCount})`,
            affectedGuestIds: matching.map((g) => g.id),
          });
        }
      }
      break;
    }

    case 'min_per_table': {
      const minCount = rule.minCount ?? 1;
      for (const [tableId, tableGuests] of tableGuestMap) {
        if (tableGuests.length === 0) continue; // skip empty tables
        const matching = tableGuests.filter((g) => guestMatchesTarget(g, rule));
        if (matching.length < minCount) {
          const table = tableMap.get(tableId);
          violations.push({
            ruleId: rule.id,
            ruleDescription: rule.description,
            priority,
            tableNumber: table?.tableNumber ?? 0,
            details: `Table ${table?.tableNumber ?? '?'} has ${matching.length} ${rule.targetCategory ?? 'matching'} guest(s) (min ${minCount} required)`,
            affectedGuestIds: matching.map((g) => g.id),
          });
        }
      }
      break;
    }

    case 'front_row': {
      // Guests matching criteria should be at front tables (lowest Y-coordinate)
      const sortedTables = [...tables].sort((a, b) => a.y - b.y);
      // "Front row" = first 30% of tables by Y position, at least 1
      const frontCount = Math.max(1, Math.ceil(sortedTables.length * 0.3));
      const frontTableIds = new Set(sortedTables.slice(0, frontCount).map((t) => t.id));

      for (const [tableId, tableGuests] of tableGuestMap) {
        if (frontTableIds.has(tableId)) continue;
        const matching = tableGuests.filter((g) => guestMatchesTarget(g, rule));
        if (matching.length > 0) {
          const table = tableMap.get(tableId);
          violations.push({
            ruleId: rule.id,
            ruleDescription: rule.description,
            priority,
            tableNumber: table?.tableNumber ?? 0,
            details: `${matching.map((g) => g.displayName).join(', ')} should be at a front table but seated at Table ${table?.tableNumber ?? '?'}`,
            affectedGuestIds: matching.map((g) => g.id),
          });
        }
      }
      break;
    }

    case 'adjacent': {
      // Guests matching target criteria should be at neighboring tables (close Y and X)
      const matchingGuests = guests.filter((g) => guestMatchesTarget(g, rule));
      const assignedMatching = matchingGuests.filter((g) =>
        assignments.some((a) => a.guestId === g.id),
      );
      if (assignedMatching.length <= 1) break;

      const guestTableIds = assignedMatching
        .map((g) => getGuestTable(g.id, assignments))
        .filter((t): t is string => !!t);
      const uniqueTableIds = [...new Set(guestTableIds)];

      if (uniqueTableIds.length <= 1) break; // all at same table is fine

      // Compute max distance between any two tables holding these guests
      let maxDist = 0;
      for (let i = 0; i < uniqueTableIds.length; i++) {
        for (let j = i + 1; j < uniqueTableIds.length; j++) {
          const t1 = tableMap.get(uniqueTableIds[i]);
          const t2 = tableMap.get(uniqueTableIds[j]);
          if (t1 && t2) {
            const dist = Math.sqrt(
              (t1.x - t2.x) ** 2 + (t1.y - t2.y) ** 2,
            );
            if (dist > maxDist) maxDist = dist;
          }
        }
      }

      // Consider "adjacent" as within 300px; flag if too far apart
      const threshold = 300;
      if (maxDist > threshold) {
        violations.push({
          ruleId: rule.id,
          ruleDescription: rule.description,
          priority,
          tableNumber: 0,
          details: `${rule.targetCategory ?? 'Matching'} guests are spread across distant tables (max distance: ${Math.round(maxDist)}px) — should be adjacent`,
          affectedGuestIds: assignedMatching.map((g) => g.id),
        });
      }
      break;
    }
  }

  return violations;
}

/** Evaluate all enabled rules against current seating. */
export function evaluateRules(
  rules: SeatingRule[],
  guests: Guest[],
  assignments: SeatingAssignment[],
  tables: LayoutObject[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.constraintType) continue;
    violations.push(...evaluateRule(rule, guests, assignments, tables));
  }
  return violations;
}

/** Score how well current seating satisfies all enabled rules (0-100). */
export function calculateRuleScore(
  rules: SeatingRule[],
  guests: Guest[],
  assignments: SeatingAssignment[],
  tables: LayoutObject[],
): RuleScoreResult {
  const enabledRules = rules.filter((r) => r.enabled && r.constraintType);
  if (enabledRules.length === 0) {
    return { score: 100, violations: [], satisfied: 0, total: 0 };
  }

  const violations = evaluateRules(rules, guests, assignments, tables);

  // Count satisfied rules (rules with no violations)
  const violatedRuleIds = new Set(violations.map((v) => v.ruleId));
  const satisfied = enabledRules.filter((r) => !violatedRuleIds.has(r.id)).length;
  const total = enabledRules.length;

  // Weighted scoring: required violations count more
  let penaltyPoints = 0;
  for (const v of violations) {
    switch (v.priority) {
      case 'required':
        penaltyPoints += 15;
        break;
      case 'preferred':
        penaltyPoints += 8;
        break;
      case 'nice_to_have':
        penaltyPoints += 3;
        break;
    }
  }

  const score = Math.max(0, Math.min(100, 100 - penaltyPoints));

  return { score, violations, satisfied, total };
}

// ---------------------------------------------------------------------------
// Fix Suggestions
// ---------------------------------------------------------------------------

/** Suggest fixes for violations by finding better table placements. */
export function suggestFixes(
  violations: RuleViolation[],
  guests: Guest[],
  assignments: SeatingAssignment[],
  tables: LayoutObject[],
): SuggestedFix[] {
  const fixes: SuggestedFix[] = [];
  const tableGuestMap = buildTableGuestMap(guests, assignments);
  const tableMap = new Map<string, LayoutObject>();
  for (const t of tables) tableMap.set(t.id, t);

  for (const violation of violations) {
    if (violation.affectedGuestIds.length === 0) continue;

    // For different_table and max_per_table: move excess guests to less-full tables
    if (
      violation.affectedGuestIds.length > 1 &&
      violation.ruleId
    ) {
      // Find which table this violation is on
      const currentTableId = assignments.find(
        (a) => a.guestId === violation.affectedGuestIds[0],
      )?.tableId;
      if (!currentTableId) continue;

      // Find a less-loaded table to move one guest to
      const guestToMove = violation.affectedGuestIds[violation.affectedGuestIds.length - 1];
      let bestTable: string | null = null;
      let bestCount = Infinity;

      for (const table of tables) {
        if (table.id === currentTableId) continue;
        const count = (tableGuestMap.get(table.id) ?? []).length;
        if (count < table.capacity && count < bestCount) {
          bestCount = count;
          bestTable = table.id;
        }
      }

      if (bestTable) {
        const fromTable = tableMap.get(currentTableId);
        const toTable = tableMap.get(bestTable);
        const guest = guests.find((g) => g.id === guestToMove);
        fixes.push({
          violation,
          action: `Move ${guest?.displayName ?? guestToMove} from Table ${fromTable?.tableNumber ?? '?'} to Table ${toTable?.tableNumber ?? '?'}`,
          moveGuestId: guestToMove,
          fromTableId: currentTableId,
          toTableId: bestTable,
        });
      }
    }
  }

  return fixes;
}
