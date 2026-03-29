/**
 * Franck Chain Engine — ReAct-style Task Planner & Chain Executor
 *
 * Decomposes complex user requests into multi-step chains of tool calls,
 * executing them in sequence with intermediate reasoning.
 *
 * Supports dependency resolution: each step can extract IDs (guestId,
 * tableId, etc.) from a previous step's JSON result and inject them
 * into subsequent step inputs.
 */

import { useEventStore } from '@/data/store';
import { executeTool } from './franck-tools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChainStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ChainStep {
  id: string;
  description: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  status: ChainStepStatus;
  result?: string;
  error?: string;
  /**
   * Dependency resolver: given the accumulated results from previous steps,
   * returns patched toolInput for this step. If it returns null, the step
   * is skipped (e.g. guest not found).
   */
  resolveDeps?: (previousResults: StepResultMap) => Record<string, unknown> | null;
}

export interface ChainResult {
  handled: boolean;
  summary: string;
  steps: ChainStep[];
  toolCalls: { name: string; result: string }[];
}

export interface ChainProgress {
  currentStep: number;
  totalSteps: number;
  steps: ChainStep[];
  phase: 'planning' | 'executing' | 'summarizing' | 'done';
}

/** Map from step id to its parsed JSON result */
type StepResultMap = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Dependency Resolution Helpers
// ---------------------------------------------------------------------------

/**
 * Parse JSON result from a step, returning null if it fails or has an error.
 */
function parseStepResult(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extract the first guestId from a search_guests result.
 */
function extractGuestId(result: Record<string, unknown>): string | null {
  const results = result.results as Array<Record<string, unknown>> | undefined;
  if (results && results.length > 0) {
    return (results[0].id as string) ?? null;
  }
  return (result.guestId as string) ?? null;
}

/**
 * Extract guest display name from a search_guests result.
 */
function extractGuestName(result: Record<string, unknown>): string | null {
  const results = result.results as Array<Record<string, unknown>> | undefined;
  if (results && results.length > 0) {
    return (results[0].displayName as string) ?? null;
  }
  return (result.displayName as string) ?? null;
}

// ---------------------------------------------------------------------------
// Chain Pattern Matching
// ---------------------------------------------------------------------------

interface ChainPattern {
  pattern: RegExp;
  description: string;
  buildSteps: (match: RegExpMatchArray, eventId: string) => ChainStep[];
}

/**
 * Known multi-step patterns that can be executed as chains
 * without an LLM call.
 */
const CHAIN_PATTERNS: ChainPattern[] = [
  // -----------------------------------------------------------------------
  // 1. Full Event Status Report (existing)
  // -----------------------------------------------------------------------
  {
    pattern: /^(?:give me |show me |get )?(?:a )?full (?:event )?(?:status|overview|report)$/i,
    description: 'Full Event Status Report',
    buildSteps: (_match, _eventId) => [
      {
        id: 'step-1',
        description: 'Get event summary',
        toolName: 'get_event_summary',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
      {
        id: 'step-2',
        description: 'Check for issues',
        toolName: 'flag_issues',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
      {
        id: 'step-3',
        description: 'Score current seating',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 2. Complete Seating Analysis (existing)
  // -----------------------------------------------------------------------
  {
    pattern: /^(?:do a )?(?:complete |full )?seating (?:analysis|review|audit)$/i,
    description: 'Complete Seating Analysis',
    buildSteps: (_match, _eventId) => [
      {
        id: 'step-1',
        description: 'Score current arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
      {
        id: 'step-2',
        description: 'Get improvement recommendations',
        toolName: 'get_seating_recommendations',
        toolInput: { limit: 5 },
        status: 'pending' as ChainStepStatus,
      },
      {
        id: 'step-3',
        description: 'Check dietary needs',
        toolName: 'analyze_dietary_needs',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
      {
        id: 'step-4',
        description: 'Flag issues',
        toolName: 'flag_issues',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 3. Seat [name] at table [N]
  // -----------------------------------------------------------------------
  {
    pattern: /^seat\s+(.+?)\s+at\s+table\s+(\d+)$/i,
    description: 'Seat Guest at Table',
    buildSteps: (match, _eventId) => {
      const name = match[1].trim();
      const tableNumber = parseInt(match[2], 10);
      return [
        {
          id: 'step-search',
          description: `Search for guest "${name}"`,
          toolName: 'search_guests',
          toolInput: { query: name },
          status: 'pending' as ChainStepStatus,
        },
        {
          id: 'step-move',
          description: `Move guest to table ${tableNumber}`,
          toolName: 'move_guest_to_table',
          toolInput: { tableNumber },
          status: 'pending' as ChainStepStatus,
          resolveDeps: (prev: StepResultMap) => {
            const searchResult = prev['step-search'] as Record<string, unknown> | null;
            if (!searchResult) return null;
            const guestId = extractGuestId(searchResult);
            if (!guestId) return null;
            return { guestId, tableNumber };
          },
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 4. Move [name] to table [N]
  // -----------------------------------------------------------------------
  {
    pattern: /^move\s+(.+?)\s+to\s+table\s+(\d+)$/i,
    description: 'Move Guest to Table',
    buildSteps: (match, _eventId) => {
      const name = match[1].trim();
      const tableNumber = parseInt(match[2], 10);
      return [
        {
          id: 'step-search',
          description: `Search for guest "${name}"`,
          toolName: 'search_guests',
          toolInput: { query: name },
          status: 'pending' as ChainStepStatus,
        },
        {
          id: 'step-move',
          description: `Move guest to table ${tableNumber}`,
          toolName: 'move_guest_to_table',
          toolInput: { tableNumber },
          status: 'pending' as ChainStepStatus,
          resolveDeps: (prev: StepResultMap) => {
            const searchResult = prev['step-search'] as Record<string, unknown> | null;
            if (!searchResult) return null;
            const guestId = extractGuestId(searchResult);
            if (!guestId) return null;
            return { guestId, tableNumber };
          },
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 5. Swap [name1] and [name2]
  // -----------------------------------------------------------------------
  {
    pattern: /^swap\s+(.+?)\s+and\s+(.+?)$/i,
    description: 'Swap Two Guests',
    buildSteps: (match, _eventId) => {
      const name1 = match[1].trim();
      const name2 = match[2].trim();
      return [
        {
          id: 'step-search1',
          description: `Search for guest "${name1}"`,
          toolName: 'search_guests',
          toolInput: { query: name1 },
          status: 'pending' as ChainStepStatus,
        },
        {
          id: 'step-search2',
          description: `Search for guest "${name2}"`,
          toolName: 'search_guests',
          toolInput: { query: name2 },
          status: 'pending' as ChainStepStatus,
        },
        {
          id: 'step-swap',
          description: `Swap ${name1} and ${name2}`,
          toolName: 'swap_guests',
          toolInput: {},
          status: 'pending' as ChainStepStatus,
          resolveDeps: (prev: StepResultMap) => {
            const r1 = prev['step-search1'] as Record<string, unknown> | null;
            const r2 = prev['step-search2'] as Record<string, unknown> | null;
            if (!r1 || !r2) return null;
            const guestId1 = extractGuestId(r1);
            const guestId2 = extractGuestId(r2);
            if (!guestId1 || !guestId2) return null;
            return { guestId1, guestId2 };
          },
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 6. Unseat [name]
  // -----------------------------------------------------------------------
  {
    pattern: /^unseat\s+(.+?)$/i,
    description: 'Unseat Guest',
    buildSteps: (match, _eventId) => {
      const name = match[1].trim();
      return [
        {
          id: 'step-search',
          description: `Search for guest "${name}"`,
          toolName: 'search_guests',
          toolInput: { query: name },
          status: 'pending' as ChainStepStatus,
        },
        {
          id: 'step-unseat',
          description: `Remove ${name} from their table`,
          toolName: 'unseat_guest',
          toolInput: {},
          status: 'pending' as ChainStepStatus,
          resolveDeps: (prev: StepResultMap) => {
            const searchResult = prev['step-search'] as Record<string, unknown> | null;
            if (!searchResult) return null;
            const guestId = extractGuestId(searchResult);
            if (!guestId) return null;
            return { guestId };
          },
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 7. Add [name] to the guest list
  // -----------------------------------------------------------------------
  {
    pattern: /^add\s+(.+?)\s+to\s+(?:the\s+)?guest\s*list$/i,
    description: 'Add Guest to List',
    buildSteps: (match, _eventId) => {
      const fullName = match[1].trim();
      const parts = fullName.split(/\s+/);
      const firstName = parts[0] ?? fullName;
      const lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      return [
        {
          id: 'step-add',
          description: `Add ${fullName} to the guest list`,
          toolName: 'add_guest',
          toolInput: { firstName, lastName: lastName || firstName },
          status: 'pending' as ChainStepStatus,
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 8. How many guests are confirmed
  // -----------------------------------------------------------------------
  {
    pattern: /^how many guests (?:are |have )?(?:confirmed|rsvp(?:'?d| yes))(?:\?)?$/i,
    description: 'Confirmed Guest Count',
    buildSteps: (_match, _eventId) => [
      {
        id: 'step-summary',
        description: 'Get event summary with confirmation counts',
        toolName: 'get_event_summary',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 9. Who is at table [N]
  // -----------------------------------------------------------------------
  {
    pattern: /^who(?:'s| is)\s+(?:at|on)\s+table\s+(\d+)(?:\?)?$/i,
    description: 'Table Guest Lookup',
    buildSteps: (match, _eventId) => {
      const tableNumber = parseInt(match[1], 10);
      return [
        {
          id: 'step-table',
          description: `Get info for table ${tableNumber}`,
          toolName: 'get_table_info',
          toolInput: { tableNumber },
          status: 'pending' as ChainStepStatus,
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 10. Show me table [N]
  // -----------------------------------------------------------------------
  {
    pattern: /^show\s+(?:me\s+)?table\s+(\d+)$/i,
    description: 'Show Table Details',
    buildSteps: (match, _eventId) => {
      const tableNumber = parseInt(match[1], 10);
      return [
        {
          id: 'step-table',
          description: `Get details for table ${tableNumber}`,
          toolName: 'get_table_info',
          toolInput: { tableNumber },
          status: 'pending' as ChainStepStatus,
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 11. Check dietary needs / dietary requirements
  // -----------------------------------------------------------------------
  {
    pattern: /^(?:check |show |get |analyze )?(?:the )?dietary\s+(?:needs|requirements|restrictions|summary)$/i,
    description: 'Dietary Needs Analysis',
    buildSteps: (_match, _eventId) => [
      {
        id: 'step-dietary',
        description: 'Analyze dietary needs across all guests',
        toolName: 'analyze_dietary_needs',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 12. Optimize seating / improve seating
  // -----------------------------------------------------------------------
  {
    pattern: /^(?:optimize|improve|fix|enhance|refine)\s+(?:the\s+)?seating$/i,
    description: 'Optimize Seating Arrangement',
    buildSteps: (_match, _eventId) => [
      {
        id: 'step-score',
        description: 'Score current seating arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
      {
        id: 'step-recs',
        description: 'Get seating recommendations',
        toolName: 'get_seating_recommendations',
        toolInput: { limit: 10 },
        status: 'pending' as ChainStepStatus,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 13. Find [name] / where is [name]
  // -----------------------------------------------------------------------
  {
    pattern: /^(?:find|locate|look up|look for|where is|where'?s)\s+(.+?)(?:\?)?$/i,
    description: 'Find Guest',
    buildSteps: (match, _eventId) => {
      const name = match[1].trim();
      return [
        {
          id: 'step-search',
          description: `Search for "${name}"`,
          toolName: 'search_guests',
          toolInput: { query: name },
          status: 'pending' as ChainStepStatus,
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 14. Draft email to [group]
  // -----------------------------------------------------------------------
  {
    pattern: /^(?:draft|write|compose|prepare)\s+(?:an? )?email\s+(?:to|for)\s+(.+?)$/i,
    description: 'Draft Email',
    buildSteps: (match, _eventId) => {
      const target = match[1].trim();
      return [
        {
          id: 'step-search',
          description: `Search for "${target}"`,
          toolName: 'search_guests',
          toolInput: { query: target },
          status: 'pending' as ChainStepStatus,
        },
        {
          id: 'step-draft',
          description: `Generate email draft for ${target}`,
          toolName: 'generate_email_draft',
          toolInput: {},
          status: 'pending' as ChainStepStatus,
          resolveDeps: (prev: StepResultMap) => {
            const searchResult = prev['step-search'] as Record<string, unknown> | null;
            if (!searchResult) return null;
            const guestId = extractGuestId(searchResult);
            if (!guestId) return null;
            return { guestId };
          },
        },
      ];
    },
  },

  // -----------------------------------------------------------------------
  // 15. Add table / add a table
  // -----------------------------------------------------------------------
  {
    pattern: /^add\s+(?:a\s+)?(?:new\s+)?table$/i,
    description: 'Add New Table',
    buildSteps: (_match, _eventId) => [
      {
        id: 'step-add',
        description: 'Add a new table to the layout',
        toolName: 'add_table',
        toolInput: {},
        status: 'pending' as ChainStepStatus,
      },
    ],
  },

  // -----------------------------------------------------------------------
  // 16. Remove table [N]
  // -----------------------------------------------------------------------
  {
    pattern: /^(?:remove|delete)\s+table\s+(\d+)$/i,
    description: 'Remove Table',
    buildSteps: (match, _eventId) => {
      const tableNumber = parseInt(match[1], 10);
      return [
        {
          id: 'step-remove',
          description: `Remove table ${tableNumber} from the layout`,
          toolName: 'remove_table',
          toolInput: { tableNumber },
          status: 'pending' as ChainStepStatus,
        },
      ];
    },
  },
];

// ---------------------------------------------------------------------------
// Chain Execution
// ---------------------------------------------------------------------------

/**
 * Try to match the user message to a known chain pattern and execute it.
 * Returns { handled: false } if no pattern matches — caller should
 * fall back to the LLM.
 */
export async function tryChainExecution(
  userMessage: string,
  eventId: string,
  _storeState: ReturnType<typeof useEventStore.getState>,
  onProgress?: (progress: ChainProgress) => void,
): Promise<ChainResult> {
  // Try each pattern
  for (const chainPattern of CHAIN_PATTERNS) {
    const match = userMessage.match(chainPattern.pattern);
    if (!match) continue;

    const steps = chainPattern.buildSteps(match, eventId);
    const toolCalls: { name: string; result: string }[] = [];
    const resultMap: StepResultMap = {};

    // Execute steps sequentially with dependency resolution
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      step.status = 'running';

      if (onProgress) {
        onProgress({
          currentStep: i,
          totalSteps: steps.length,
          steps: [...steps],
          phase: 'executing',
        });
      }

      try {
        // Resolve dependencies from previous steps
        let resolvedInput = step.toolInput;
        if (step.resolveDeps) {
          const patched = step.resolveDeps(resultMap);
          if (patched === null) {
            step.status = 'failed';
            step.error = 'Could not resolve dependencies from previous steps — guest or resource not found.';
            continue;
          }
          resolvedInput = patched;
        }

        const storeState = useEventStore.getState();
        const result = await executeTool(step.toolName, resolvedInput, storeState, eventId);
        step.status = 'completed';
        step.result = result;
        toolCalls.push({ name: step.toolName, result });

        // Store parsed result for dependency resolution
        const parsed = parseStepResult(result);
        if (parsed) {
          resultMap[step.id] = parsed;
        }
      } catch (err) {
        step.status = 'failed';
        step.error = err instanceof Error ? err.message : String(err);
      }
    }

    if (onProgress) {
      onProgress({
        currentStep: steps.length,
        totalSteps: steps.length,
        steps: [...steps],
        phase: 'done',
      });
    }

    // Build summary from results
    const summary = formatChainSummary(chainPattern.description, steps);

    return {
      handled: true,
      summary,
      steps,
      toolCalls,
    };
  }

  // No pattern matched
  return {
    handled: false,
    summary: '',
    steps: [],
    toolCalls: [],
  };
}

// ---------------------------------------------------------------------------
// Franck-flavoured Summaries
// ---------------------------------------------------------------------------

/** Franck personality phrases for success */
const FRANCK_SUCCESS_INTROS = [
  'Zis is done, and it is perfect!',
  'Voilà! Franck has handled everything.',
  'Of course I can do zis — I am Franck!',
  'Consider it done, dahling.',
  'Flawless execution, as always.',
  'Zis was child\'s play for someone of my talent.',
  'Done! And may I say, brilliant choice.',
  'Handled wis ze grace and precision you\'d expect from me.',
];

/** Franck personality phrases for failures */
const FRANCK_FAILURE_INTROS = [
  'Zis is a disaster!',
  'Oh no no no — somesing went wrong.',
  'Even Franck cannot work miracles wis broken data!',
  'We have a problem, dahling.',
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Format a human-readable summary of chain execution results
 * with Franck Eggelhoffer's distinctive personality.
 */
function formatChainSummary(description: string, steps: ChainStep[]): string {
  const completedSteps = steps.filter((s) => s.status === 'completed');
  const failedSteps = steps.filter((s) => s.status === 'failed');
  const allSucceeded = failedSteps.length === 0 && completedSteps.length > 0;

  const intro = allSucceeded ? pickRandom(FRANCK_SUCCESS_INTROS) : pickRandom(FRANCK_FAILURE_INTROS);

  let summary = `**${description}** — *${intro}*\n\n`;

  for (const step of completedSteps) {
    let resultText = step.result ?? '';
    try {
      const parsed = JSON.parse(resultText);
      if (typeof parsed === 'object' && parsed !== null) {
        // Produce friendlier summaries for common result shapes
        const friendly = humanizeResult(step.toolName, parsed);
        if (friendly) {
          resultText = friendly;
        } else {
          resultText = JSON.stringify(parsed, null, 2);
        }
      }
    } catch {
      // keep as-is
    }
    summary += `### ${step.description}\n${resultText}\n\n`;
  }

  if (failedSteps.length > 0) {
    summary += `\n---\n*Sacré bleu! ${failedSteps.length} step(s) hit a snag:*\n`;
    for (const step of failedSteps) {
      summary += `- **${step.description}**: ${step.error ?? 'Unknown error'}\n`;
    }
    summary += '\n*Franck will need you to double-check ze details and try again.*\n';
  }

  return summary;
}

/**
 * Try to produce a natural-language summary from known result shapes.
 * Returns null if the shape is not recognized.
 */
function humanizeResult(toolName: string, parsed: Record<string, unknown>): string | null {
  switch (toolName) {
    case 'search_guests': {
      const count = parsed.resultCount as number | undefined;
      const results = parsed.results as Array<Record<string, unknown>> | undefined;
      if (count === 0) return 'No guests found matching zat name.';
      if (results && results.length > 0) {
        const names = results.slice(0, 5).map((r) => {
          const seating = r.seating as Record<string, unknown> | null;
          const seat = seating ? ` (Table ${seating.tableNumber ?? seating.tableName})` : ' (not yet seated)';
          return `**${r.displayName}**${seat}`;
        });
        return `Found ${count} guest(s):\n${names.map((n) => `- ${n}`).join('\n')}`;
      }
      return null;
    }
    case 'move_guest_to_table': {
      if (parsed.moved) {
        return `**${parsed.guestName}** has been moved to **${parsed.tableName}** (Table ${parsed.tableNumber}).`;
      }
      return null;
    }
    case 'swap_guests': {
      if (parsed.swapped) {
        const g1 = parsed.guest1 as Record<string, unknown>;
        const g2 = parsed.guest2 as Record<string, unknown>;
        return `Swapped! **${g1.name}** is now at ${g1.to}, and **${g2.name}** is now at ${g2.to}.`;
      }
      return null;
    }
    case 'unseat_guest': {
      if (parsed.unseated) {
        return `**${parsed.guestName}** has been removed from zeir table.`;
      }
      return null;
    }
    case 'add_guest': {
      if (parsed.added) {
        return `**${parsed.displayName}** has been added to ze guest list (status: ${parsed.rsvpStatus}).`;
      }
      return null;
    }
    case 'get_event_summary': {
      return [
        `**${parsed.name}** — ${parsed.type} (${parsed.status})`,
        parsed.date ? `Date: ${parsed.date}${parsed.time ? ` at ${parsed.time}` : ''}` : null,
        parsed.venue ? `Venue: ${parsed.venue}` : null,
        `Guests: **${parsed.confirmedCount}** confirmed, **${parsed.pendingCount}** pending, **${parsed.declinedCount}** declined`,
        `Total expected: **${parsed.totalExpectedAttendance}** — Confirmation rate: **${parsed.confirmationRate}%**`,
      ].filter(Boolean).join('\n');
    }
    case 'analyze_dietary_needs': {
      const needs = parsed.dietaryBreakdown as Array<Record<string, unknown>> | undefined;
      if (needs && needs.length > 0) {
        const lines = needs.map((n) => `- ${n.restriction}: ${n.count} guest(s)`);
        return `Dietary requirements across your guest list:\n${lines.join('\n')}`;
      }
      return 'No special dietary needs recorded for your guests.';
    }
    case 'score_seating': {
      const score = parsed.score as Record<string, unknown> | undefined;
      if (score) {
        return `Current seating score: **${score.overall ?? 'N/A'}** / 100 (${parsed.assignmentCount} assignments)`;
      }
      return null;
    }
    case 'add_table': {
      if (parsed.added) {
        return `**${parsed.name}** (Table ${parsed.tableNumber}) added — ${parsed.type}, capacity ${parsed.capacity}.`;
      }
      return null;
    }
    case 'remove_table': {
      if (parsed.removed) {
        return `**${parsed.tableName}** (Table ${parsed.tableNumber}) removed. ${parsed.guestsUnseated} guest(s) were unseated.`;
      }
      return null;
    }
    case 'generate_email_draft': {
      if (parsed.subject) {
        return [
          `**To:** ${parsed.guestName} (${parsed.email})`,
          `**Subject:** ${parsed.subject}`,
          `**Template:** ${parsed.templateUsed}`,
          '',
          parsed.body as string,
        ].join('\n');
      }
      return null;
    }
    case 'get_table_info': {
      const tables = parsed.tables as Array<Record<string, unknown>> | undefined;
      if (tables) {
        const lines = tables.map((t) =>
          `- **${t.tableName}** (Table ${t.tableNumber}): ${t.seated}/${t.capacity} seated (${t.utilizationPct}%)`,
        );
        return [
          `${parsed.totalTables} tables — ${parsed.seatedGuests} guests seated, ${parsed.unseatedConfirmed} confirmed but unseated.`,
          '',
          ...lines,
        ].join('\n');
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Returns known chain pattern descriptions (for the capabilities panel).
 */
export function getChainCapabilities(): { description: string; triggerExample: string }[] {
  return CHAIN_PATTERNS.map((p) => ({
    description: p.description,
    triggerExample: p.pattern.source.replace(/[\\^$()|\[\]{}?+*]/g, '').slice(0, 50),
  }));
}
