import type { Guest, SeatingRule, SeatingAssignment, LayoutObject } from '@/types/events';

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  severity: 'satisfied' | 'violated';
  detail: string;
  guestIds: string[];
}

export interface RuleEvaluation {
  rule: SeatingRule;
  status: 'satisfied' | 'violated' | 'partial' | 'not_applicable';
  satisfiedCount: number;
  totalCount: number;
  violations: RuleViolation[];
}

/**
 * Evaluate all tag-based seating rules against current assignments.
 */
export function evaluateRules(
  rules: SeatingRule[],
  guests: Guest[],
  assignments: SeatingAssignment[],
  tables: LayoutObject[],
): RuleEvaluation[] {
  // Build lookup maps
  const guestById = new Map(guests.map((g) => [g.id, g]));
  const guestTable = new Map<string, string>(); // guestId → tableId
  assignments.forEach((a) => guestTable.set(a.guestId, a.tableId));
  const tableGuests = new Map<string, string[]>(); // tableId → guestIds
  assignments.forEach((a) => {
    const existing = tableGuests.get(a.tableId) || [];
    existing.push(a.guestId);
    tableGuests.set(a.tableId, existing);
  });

  return rules
    .filter((r) => r.enabled && r.ruleType && r.intent)
    .map((rule) => evaluateRule(rule, guests, guestById, guestTable, tableGuests));
}

function evaluateRule(
  rule: SeatingRule,
  guests: Guest[],
  guestById: Map<string, Guest>,
  guestTable: Map<string, string>,
  tableGuests: Map<string, string[]>,
): RuleEvaluation {
  if (rule.ruleType === 'same_tag' && rule.tag) {
    return evaluateSameTagRule(rule, guests, guestTable, tableGuests);
  }
  if (rule.ruleType === 'cross_tag' && rule.tagA && rule.tagB) {
    return evaluateCrossTagRule(rule, guests, guestTable, tableGuests);
  }
  return { rule, status: 'not_applicable', satisfiedCount: 0, totalCount: 0, violations: [] };
}

function evaluateSameTagRule(
  rule: SeatingRule,
  guests: Guest[],
  guestTable: Map<string, string>,
  tableGuests: Map<string, string[]>,
): RuleEvaluation {
  const tag = rule.tag!;
  const intent = rule.intent!;
  const taggedGuests = guests.filter((g) => g.relationshipTags.includes(tag));
  const assignedTagged = taggedGuests.filter((g) => guestTable.has(g.id));

  if (assignedTagged.length < 2) {
    return { rule, status: 'not_applicable', satisfiedCount: 0, totalCount: 0, violations: [] };
  }

  const violations: RuleViolation[] = [];
  let satisfiedCount = 0;
  let totalCount = 0;

  if (intent === 'same_table') {
    // Group by table, check if all tagged guests are together
    const tablesUsed = new Set(assignedTagged.map((g) => guestTable.get(g.id)!));
    totalCount = 1; // one group to satisfy
    if (tablesUsed.size === 1) {
      satisfiedCount = 1;
    } else {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: 'violated',
        detail: `Guests with tag "${tag}" are split across ${tablesUsed.size} tables (should be 1).`,
        guestIds: assignedTagged.map((g) => g.id),
      });
    }
  } else if (intent === 'separate') {
    // Each tagged guest should be at a different table
    const tableToGuests = new Map<string, Guest[]>();
    assignedTagged.forEach((g) => {
      const tId = guestTable.get(g.id)!;
      const list = tableToGuests.get(tId) || [];
      list.push(g);
      tableToGuests.set(tId, list);
    });
    // Count pairs — each table with >1 tagged guest is a violation
    for (const [, guestsAtTable] of tableToGuests) {
      totalCount += guestsAtTable.length;
      if (guestsAtTable.length === 1) {
        satisfiedCount++;
      } else {
        satisfiedCount++; // first one is fine
        for (let i = 1; i < guestsAtTable.length; i++) {
          violations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: 'violated',
            detail: `${guestsAtTable[i].displayName} shares a table with another "${tag}" guest (should be separate).`,
            guestIds: guestsAtTable.map((g) => g.id),
          });
        }
      }
    }
  } else {
    // nearby — softer check, just report if satisfied
    totalCount = 1;
    satisfiedCount = 1; // nearby is advisory
  }

  const status = violations.length === 0
    ? 'satisfied'
    : satisfiedCount > 0 ? 'partial' : 'violated';

  return { rule, status, satisfiedCount, totalCount, violations };
}

function evaluateCrossTagRule(
  rule: SeatingRule,
  guests: Guest[],
  guestTable: Map<string, string>,
  tableGuests: Map<string, string[]>,
): RuleEvaluation {
  const { tagA, tagB, intent } = rule as { tagA: string; tagB: string; intent: string };
  const groupA = guests.filter((g) => g.relationshipTags.includes(tagA));
  const groupB = guests.filter((g) => g.relationshipTags.includes(tagB));
  const assignedA = groupA.filter((g) => guestTable.has(g.id));
  const assignedB = groupB.filter((g) => guestTable.has(g.id));

  if (assignedA.length === 0 || assignedB.length === 0) {
    return { rule, status: 'not_applicable', satisfiedCount: 0, totalCount: 0, violations: [] };
  }

  const violations: RuleViolation[] = [];
  let satisfiedCount = 0;
  const totalCount = assignedA.length;

  if (intent === 'same_table') {
    // Each A guest should share a table with at least one B guest
    for (const guestA of assignedA) {
      const tableId = guestTable.get(guestA.id)!;
      const tablemates = tableGuests.get(tableId) || [];
      const hasBMatch = tablemates.some((tmId) => {
        const tm = guests.find((g) => g.id === tmId);
        return tm && tm.id !== guestA.id && tm.relationshipTags.includes(tagB);
      });
      if (hasBMatch) {
        satisfiedCount++;
      } else {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: 'violated',
          detail: `${guestA.displayName} ("${tagA}") is not seated with any "${tagB}" guest.`,
          guestIds: [guestA.id],
        });
      }
    }
  } else if (intent === 'separate') {
    // Each A guest should NOT share a table with any B guest
    for (const guestA of assignedA) {
      const tableId = guestTable.get(guestA.id)!;
      const tablemates = tableGuests.get(tableId) || [];
      const hasBConflict = tablemates.some((tmId) => {
        const tm = guests.find((g) => g.id === tmId);
        return tm && tm.id !== guestA.id && tm.relationshipTags.includes(tagB);
      });
      if (!hasBConflict) {
        satisfiedCount++;
      } else {
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: 'violated',
          detail: `${guestA.displayName} ("${tagA}") is seated with a "${tagB}" guest (should be separate).`,
          guestIds: [guestA.id],
        });
      }
    }
  } else {
    // nearby — advisory
    satisfiedCount = totalCount;
  }

  const status = violations.length === 0
    ? 'satisfied'
    : satisfiedCount > 0 ? 'partial' : 'violated';

  return { rule, status, satisfiedCount, totalCount, violations };
}

/**
 * Collect all unique relationship tags across a guest list.
 */
export function collectAllTags(guests: Guest[]): string[] {
  const tagSet = new Set<string>();
  guests.forEach((g) => g.relationshipTags.forEach((t) => tagSet.add(t)));
  return Array.from(tagSet).sort();
}
