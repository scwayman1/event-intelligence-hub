/**
 * Franck Workflows — Pre-built Workflow Definitions & Runner
 *
 * Defines high-level workflows that Franck can execute instantly
 * without LLM calls. Each workflow is a named sequence of tool
 * invocations with known parameters.
 *
 * Includes fuzzy matching with synonym expansion and Levenshtein
 * distance for typo tolerance.
 */

import { useEventStore } from '@/data/store';
import { executeTool } from './franck-tools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowStep {
  id: string;
  label: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  status: WorkflowStepStatus;
  result?: string;
  error?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  triggerPhrases: string[];
  buildSteps: (params: Record<string, unknown>, eventId: string) => WorkflowStep[];
}

export interface WorkflowMatch {
  workflow: WorkflowDefinition;
  params: Record<string, unknown>;
}

export interface WorkflowResult {
  steps: WorkflowStep[];
  toolCalls: { name: string; result: string }[];
  success: boolean;
}

export interface WorkflowProgress {
  workflowName: string;
  currentStep: number;
  totalSteps: number;
  steps: WorkflowStep[];
}

// ---------------------------------------------------------------------------
// Synonym Expansion Map
// ---------------------------------------------------------------------------

const SYNONYM_MAP: Record<string, string[]> = {
  guests: ['people', 'attendees', 'invitees'],
  people: ['guests', 'attendees', 'invitees'],
  attendees: ['guests', 'people', 'invitees'],
  invitees: ['guests', 'people', 'attendees'],
  seat: ['place', 'assign', 'put'],
  place: ['seat', 'assign', 'put'],
  assign: ['seat', 'place', 'put'],
  table: ['seating'],
  seating: ['table'],
  check: ['review', 'audit', 'look'],
  review: ['check', 'audit', 'look'],
  audit: ['check', 'review', 'look'],
  look: ['check', 'review', 'audit'],
  swap: ['switch', 'exchange', 'trade'],
  switch: ['swap', 'exchange', 'trade'],
  move: ['transfer', 'relocate', 'put'],
  redo: ['restart', 'reset', 'repeat'],
  summary: ['overview', 'brief', 'recap'],
  overview: ['summary', 'brief', 'recap'],
  optimize: ['improve', 'enhance', 'refine'],
  improve: ['optimize', 'enhance', 'refine'],
  change: ['modify', 'alter', 'rearrange'],
  arrange: ['organize', 'set up', 'plan'],
};

// ---------------------------------------------------------------------------
// Levenshtein Distance (for typo tolerance)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row optimization for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/** Check if two words are a fuzzy match (exact, substring, or within Levenshtein distance 2) */
function fuzzyWordMatch(messageWord: string, triggerWord: string): boolean {
  if (messageWord === triggerWord) return true;
  if (messageWord.includes(triggerWord) || triggerWord.includes(messageWord)) return true;

  // Only apply Levenshtein for words of reasonable length (avoid false positives on short words)
  if (messageWord.length >= 4 && triggerWord.length >= 4) {
    const dist = levenshtein(messageWord, triggerWord);
    const maxDist = Math.min(messageWord.length, triggerWord.length) >= 6 ? 2 : 1;
    if (dist <= maxDist) return true;
  }

  return false;
}

/** Expand a set of trigger words to include their synonyms */
function expandWithSynonyms(words: Set<string>): Set<string> {
  const expanded = new Set(words);
  for (const word of words) {
    const synonyms = SYNONYM_MAP[word];
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
  }
  return expanded;
}

// ---------------------------------------------------------------------------
// Workflow Definitions
// ---------------------------------------------------------------------------

export const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'full-seating-setup',
    name: 'Full Seating Setup',
    icon: '\uD83D\uDD17',  // link emoji
    description: 'Clear all seating, auto-seat everyone, then score the result',
    triggerPhrases: [
      'full seating setup',
      'set up all seating',
      'seat everyone from scratch',
      'redo all seating',
      'start seating over',
      'redo the seating',
      'reseat everyone',
      'clear and reseat',
      'start fresh',
      'set up the tables from zero',
      'fresh seating arrangement',
      'begin seating from nothing',
      'wipe seating and redo',
      'blank slate seating',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'ws-1',
        label: 'Clear existing seating',
        toolName: 'clear_all_seating',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'ws-2',
        label: 'Auto-seat all guests',
        toolName: 'auto_seat_guests',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'ws-3',
        label: 'Score the arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending',
      },
    ],
  },
  {
    id: 'auto-seat',
    name: 'Auto-Seat Guests',
    icon: '\uD83D\uDC65',  // people emoji
    description: 'Automatically seat all unassigned guests at available tables',
    triggerPhrases: [
      'auto seat',
      'auto-seat',
      'seat everyone',
      'seat the guests',
      'seat all guests',
      'assign seats',
      'assign seating',
      'do the seating',
      'arrange seating',
      'arrange the guests',
      'seat people',
      'fill the tables',
      'put people at tables',
      'assign tables',
      'assign everyone',
      'place guests',
      'place everyone',
      'seat them',
      'find seats for everyone',
      'give everyone a seat',
      'put guests in seats',
      'seat all the attendees',
      'figure out the seating',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'as-1',
        label: 'Auto-seat all unassigned guests',
        toolName: 'auto_seat_guests',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'as-2',
        label: 'Score the arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'as-3',
        label: 'Check for issues',
        toolName: 'flag_issues',
        toolInput: {},
        status: 'pending',
      },
    ],
  },
  {
    id: 'change-seating',
    name: 'Change Seating Arrangement',
    icon: '\uD83D\uDD04',  // cycle emoji
    description: 'Clear current seating and create a fresh optimized arrangement',
    triggerPhrases: [
      'change the seating',
      'change seating',
      'change the seating assignments',
      'change seats',
      'change the arrangement',
      'rearrange seating',
      'rearrange the seats',
      'rearrange everyone',
      'rearrange the tables',
      'shuffle seating',
      'shuffle the seats',
      'mix up the seating',
      'new seating arrangement',
      'new arrangement',
      'different seating',
      'different arrangement',
      'switch things up',
      'reassign seats',
      'reassign seating',
      'reassign everyone',
      'move everyone around',
      'change it up',
      'i want different seating',
      'give me a new arrangement',
      'shake up the tables',
      'mix everyone around',
      'try a different layout',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'cs-1',
        label: 'Clear all current seating',
        toolName: 'clear_all_seating',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'cs-2',
        label: 'Create new seating arrangement',
        toolName: 'auto_seat_guests',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'cs-3',
        label: 'Optimize with refinement loop',
        toolName: 'run_refinement_loop',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'cs-4',
        label: 'Score final arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending',
      },
    ],
  },
  {
    id: 'quick-optimization',
    name: 'Quick Optimization',
    icon: '\u26A1',  // zap emoji
    description: 'Optimize current seating with refinement loop, then score',
    triggerPhrases: [
      'quick optimization',
      'optimize seating',
      'optimize the seating',
      'improve seating',
      'improve the seating',
      'make seating better',
      'better seating',
      'refine seating',
      'refine the seating',
      'optimize',
      'tweak the seating',
      'fine tune',
      'can you make it better',
      'polish the arrangement',
      'make the seating work better',
      'enhance the arrangement',
      'tighten up the seating',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'wo-1',
        label: 'Score current arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wo-2',
        label: 'Run optimization loop',
        toolName: 'run_refinement_loop',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wo-3',
        label: 'Score optimized arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wo-4',
        label: 'Flag remaining issues',
        toolName: 'flag_issues',
        toolInput: {},
        status: 'pending',
      },
    ],
  },
  {
    id: 'event-readiness-check',
    name: 'Event Readiness Check',
    icon: '\u2705',  // checkmark emoji
    description: 'Full event summary, attendance projection, dietary analysis, and issue scan',
    triggerPhrases: [
      'event readiness check',
      'readiness check',
      'is everything ready',
      'pre-event check',
      'event checklist',
      'how is the event',
      'event status',
      'event overview',
      'how are we looking',
      'status report',
      "how's the event",
      'hows the event',
      'how is the event looking',
      'hows my event looking',
      'how is my event',
      'event check',
      'whats the status',
      'give me a status',
      'are we good to go',
      'are we ready',
      'run the checklist',
      'preflight check',
      'is my event ready',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'wr-1',
        label: 'Get event summary',
        toolName: 'get_event_summary',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wr-2',
        label: 'Project attendance',
        toolName: 'get_attendance_projection',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wr-3',
        label: 'Analyze dietary needs',
        toolName: 'analyze_dietary_needs',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wr-4',
        label: 'Flag issues',
        toolName: 'flag_issues',
        toolInput: {},
        status: 'pending',
      },
    ],
  },
  {
    id: 'guest-list-audit',
    name: 'Guest List Audit',
    icon: '\uD83D\uDCCB',  // clipboard emoji
    description: 'Analyze the guest list and check for any issues or missing data',
    triggerPhrases: [
      'guest list audit',
      'audit guest list',
      'check guest list',
      'review guests',
      'guest overview',
      'who is coming',
      'guest report',
      'who is invited',
      'whats the guest list',
      'show me the guests',
      'how many guests',
      'tell me about the guest list',
      'run a guest audit',
      'look at the guests',
      'check on the guests',
      'guest list report',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'wg-1',
        label: 'Analyze full guest list',
        toolName: 'analyze_guest_list',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wg-2',
        label: 'Check dietary needs',
        toolName: 'analyze_dietary_needs',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'wg-3',
        label: 'Flag issues',
        toolName: 'flag_issues',
        toolInput: {},
        status: 'pending',
      },
    ],
  },

  // -------------------------------------------------------------------------
  // New Workflows
  // -------------------------------------------------------------------------

  {
    id: 'swap-two-guests',
    name: 'Swap Two Guests',
    icon: '\uD83D\uDD00',  // shuffle tracks emoji
    description: 'Swap the seating assignments of two guests',
    triggerPhrases: [
      'swap two guests',
      'swap guests',
      'swap seats',
      'swap their seats',
      'switch two guests',
      'switch guests',
      'switch seats',
      'switch their seats',
      'exchange seats',
      'trade seats',
      'swap them',
      'switch them',
      'swap seating',
      'switch seating',
      'can you swap',
      'swap those two',
      'switch those two',
    ],
    buildSteps: (params, _eventId) => [
      {
        id: 'sg-1',
        label: `Search for first guest: ${params.guestA ?? 'guest A'}`,
        toolName: 'search_guests',
        toolInput: { query: (params.guestA as string) ?? '' },
        status: 'pending',
      },
      {
        id: 'sg-2',
        label: `Search for second guest: ${params.guestB ?? 'guest B'}`,
        toolName: 'search_guests',
        toolInput: { query: (params.guestB as string) ?? '' },
        status: 'pending',
      },
      {
        id: 'sg-3',
        label: 'Swap their seats',
        toolName: 'swap_guests',
        toolInput: {
          guestA: (params.guestA as string) ?? '',
          guestB: (params.guestB as string) ?? '',
        },
        status: 'pending',
      },
    ],
  },
  {
    id: 'move-guest-to-table',
    name: 'Move Guest to Table',
    icon: '\u27A1\uFE0F',  // right arrow emoji
    description: 'Move a specific guest to a specific table',
    triggerPhrases: [
      'move guest to table',
      'move to table',
      'put at table',
      'put guest at table',
      'seat at table',
      'assign to table',
      'transfer to table',
      'relocate to table',
      'move them to table',
      'place at table',
      'change their table',
      'move to a different table',
      'put them at another table',
      'can you move',
      'sit them at table',
    ],
    buildSteps: (params, _eventId) => [
      {
        id: 'mg-1',
        label: `Search for guest: ${params.guestName ?? 'guest'}`,
        toolName: 'search_guests',
        toolInput: { query: (params.guestName as string) ?? '' },
        status: 'pending',
      },
      {
        id: 'mg-2',
        label: `Move to table ${params.tableNumber ?? '?'}`,
        toolName: 'move_guest_to_table',
        toolInput: {
          guestName: (params.guestName as string) ?? '',
          tableNumber: params.tableNumber ?? 0,
        },
        status: 'pending',
      },
    ],
  },
  {
    id: 'unseat-all-and-reseat',
    name: 'Unseat All and Reseat',
    icon: '\uD83D\uDD03',  // clockwise arrows emoji
    description: 'Clear every seat and start fresh with automatic placement and scoring',
    triggerPhrases: [
      'redo seating',
      'start seating over',
      'reseat everyone',
      'unseat everyone',
      'clear all seats and redo',
      'nuke seating',
      'reset the seating',
      'tear it all down',
      'start over with seating',
      'wipe the seating clean',
      'do the seating again',
      'from the top',
      'clear seats and reseat',
      'take everyone out and redo it',
      'remove all and reseat',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'ur-1',
        label: 'Clear all current seating assignments',
        toolName: 'clear_all_seating',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'ur-2',
        label: 'Auto-seat all guests fresh',
        toolName: 'auto_seat_guests',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'ur-3',
        label: 'Score the new arrangement',
        toolName: 'score_seating',
        toolInput: {},
        status: 'pending',
      },
    ],
  },
  {
    id: 'event-summary',
    name: 'Event Summary',
    icon: '\uD83D\uDCCA',  // bar chart emoji
    description: 'Get a quick overview of the event and flag any issues',
    triggerPhrases: [
      'summarize',
      'summary',
      'overview',
      'brief me',
      'what do i need to know',
      'give me the summary',
      'event summary',
      'whats going on',
      'catch me up',
      'fill me in',
      'give me the rundown',
      'tldr',
      'quick summary',
      'high level overview',
      'the big picture',
      'bring me up to speed',
    ],
    buildSteps: (_params, _eventId) => [
      {
        id: 'es-1',
        label: 'Gather event summary',
        toolName: 'get_event_summary',
        toolInput: {},
        status: 'pending',
      },
      {
        id: 'es-2',
        label: 'Flag any issues',
        toolName: 'flag_issues',
        toolInput: {},
        status: 'pending',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Workflow Matching
// ---------------------------------------------------------------------------

/**
 * Match a user message to a workflow using fuzzy keyword matching with
 * synonym expansion and Levenshtein distance for typo tolerance.
 *
 * Scores each workflow by how many trigger-phrase words appear in the message.
 * Returns the BEST match by score if it meets the minimum threshold, or null.
 */
export function matchWorkflow(userMessage: string): WorkflowMatch | null {
  const normalized = userMessage.toLowerCase().trim()
    .replace(/[?!.,;:'"]/g, '') // strip punctuation
    .replace(/\s+/g, ' ');

  // Quick exit for very short or clearly conversational messages
  if (normalized.length < 4) return null;
  const conversationalPrefixes = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'yes', 'no', 'ok', 'sure'];
  if (conversationalPrefixes.includes(normalized)) return null;

  // ── CRITICAL: Only match short, direct commands ────────────────
  // Workflows are for simple commands like "seat everyone" or "auto seat".
  // Anything longer than 15 words is too complex for a workflow.
  const wordCount = normalized.split(' ').length;
  if (wordCount > 15) return null;

  // ── Skip workflows that require parameters ─────────────────────
  // Workflows like "Swap Two Guests" and "Move Guest to Table" need
  // guest names / table numbers that the matcher can't extract.
  // These must go through the LLM tool-calling path.
  const PARAM_REQUIRED_WORKFLOWS = new Set([
    'swap-two-guests',
    'move-guest-to-table',
  ]);

  // ── EXACT phrase matching ONLY ─────────────────────────────────
  // Fuzzy matching caused too many false positives. Now we only match
  // when the user's message contains an exact trigger phrase.
  let bestMatch: WorkflowDefinition | null = null;
  let bestLength = 0;

  for (const workflow of WORKFLOWS) {
    if (PARAM_REQUIRED_WORKFLOWS.has(workflow.id)) continue;

    for (const phrase of workflow.triggerPhrases) {
      if (normalized === phrase || normalized.includes(phrase)) {
        // The phrase must cover a meaningful portion of the message
        const coverage = phrase.length / normalized.length;
        if (coverage >= 0.35 && phrase.length > bestLength) {
          bestLength = phrase.length;
          bestMatch = workflow;
        }
      }
    }
  }

  return bestMatch ? { workflow: bestMatch, params: {} } : null;
}

// ---------------------------------------------------------------------------
// Workflow Runner
// ---------------------------------------------------------------------------

/**
 * Execute a workflow's steps sequentially, calling onStepComplete
 * after each step finishes.
 */
export async function runWorkflow(
  workflow: WorkflowDefinition,
  params: Record<string, unknown>,
  eventId: string,
  onStepComplete?: (progress: WorkflowProgress) => void,
): Promise<WorkflowResult> {
  const steps = workflow.buildSteps(params, eventId);
  const toolCalls: { name: string; result: string }[] = [];
  let allSuccess = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    step.status = 'running';

    if (onStepComplete) {
      onStepComplete({
        workflowName: workflow.name,
        currentStep: i,
        totalSteps: steps.length,
        steps: [...steps],
      });
    }

    try {
      const storeState = useEventStore.getState();
      const result = await executeTool(step.toolName, step.toolInput, storeState, eventId);
      step.status = 'completed';
      step.result = result;
      toolCalls.push({ name: step.toolName, result });
    } catch (err) {
      step.status = 'failed';
      step.error = err instanceof Error ? err.message : String(err);
      allSuccess = false;
    }

    if (onStepComplete) {
      onStepComplete({
        workflowName: workflow.name,
        currentStep: i + 1,
        totalSteps: steps.length,
        steps: [...steps],
      });
    }
  }

  return { steps, toolCalls, success: allSuccess };
}

// ---------------------------------------------------------------------------
// Summary Formatting
// ---------------------------------------------------------------------------

/** Extract human-readable highlights from a tool result JSON string */
function summarizeToolResult(toolName: string, resultStr: string): string {
  try {
    const data = JSON.parse(resultStr);
    if (data.error) return `Error: ${data.message}`;

    switch (toolName) {
      case 'auto_seat_guests':
        return `Seated **${data.applied ?? 0}** guests across tables. ${data.summary ?? ''}`;
      case 'clear_all_seating':
        return `Cleared **${data.cleared ?? 0}** seating assignments.`;
      case 'score_seating':
        return `Seating score: **${data.score ?? 'N/A'}**/100`;
      case 'run_refinement_loop':
        return `Refinement: score ${data.startScore ?? '?'} \u2192 ${data.endScore ?? '?'} (${data.swapsApplied ?? 0} swaps, ${data.guestsPlaced ?? 0} guests placed)`;
      case 'flag_issues':
        return data.issueCount === 0
          ? 'No issues found \u2014 magnifique!'
          : `Found **${data.issueCount}** issue(s): ${(data.issues ?? []).slice(0, 3).map((i: { title: string }) => i.title).join(', ')}`;
      case 'get_event_summary':
        return `**${data.name}** \u2014 ${data.guestCount ?? 0} guests, ${data.confirmedCount ?? 0} confirmed, ${data.declinedCount ?? 0} declined`;
      case 'get_attendance_projection':
        return `Projected attendance: ${data.projection?.expected ?? '?'} (best: ${data.projection?.bestCase ?? '?'}, worst: ${data.projection?.worstCase ?? '?'})`;
      case 'analyze_dietary_needs':
        return `${data.totalWithRestrictions ?? 0} guests with dietary needs, ${data.totalWithAccessibility ?? 0} with accessibility needs`;
      case 'analyze_guest_list':
        return `${data.totalFiltered ?? 0} guests \u2014 confirmation rate: ${data.analytics?.confirmationRate ?? '?'}%`;
      case 'get_seating_recommendations':
        return `${data.totalRecommendations ?? 0} recommendations found`;
      case 'search_guests':
        return `Found **${data.results?.length ?? 0}** matching guest(s)`;
      case 'swap_guests':
        return data.success ? 'Guests swapped successfully \u2014 voil\u00E0!' : `Swap failed: ${data.message ?? 'unknown error'}`;
      case 'move_guest_to_table':
        return data.success ? `Guest moved to table \u2014 tr\u00E8s bien!` : `Move failed: ${data.message ?? 'unknown error'}`;
      default:
        // Generic: show a few key fields
        const keys = Object.keys(data).filter(k => k !== 'error');
        return keys.slice(0, 3).map(k => `${k}: ${JSON.stringify(data[k])}`).join(', ');
    }
  } catch {
    return resultStr.slice(0, 200);
  }
}

// Franck's dramatic sign-off lines, randomly selected for variety
const FRANCK_SUCCESS_OPENERS = [
  "C'est magnifique! Franck has executed every step with perfection!",
  "Voil\u00E0! Franck has orchestrated this with the precision of a Parisian souffl\u00E9!",
  "Formidable! Every step, flawless \u2014 as Franck demands!",
  "Tr\u00E8s bien! The workflow is complete, and Franck is \u2014 naturally \u2014 satisfied.",
  "Merveilleux! Franck does not disappoint, and neither did this workflow!",
];

const FRANCK_FAILURE_OPENERS = [
  "Mon Dieu! The workflow hit some turbulence \u2014 but Franck persevered!",
  "Quelle catastrophe partielle! Some steps stumbled, but Franck carried on!",
  "Sacr\u00E9 bleu! Not every step cooperated \u2014 Franck is not amused.",
  "H\u00E9las! There were complications, but Franck handled them with grace.",
];

const FRANCK_CLOSERS = [
  "The choreography of human connection has been orchestrated. Franck does not do mediocre!",
  "Another masterpiece from Franck \u2014 the art of the arrangement is never done, but today it is parfait!",
  "Franck has spoken. The rest is in the hands of destiny \u2014 and the seating chart.",
  "Remember: every seat tells a story. Franck has made sure they are all bestsellers.",
  "Fin! If the guests are unhappy, it is not Franck's fault \u2014 it is their lack of joie de vivre!",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Format a Franck-style summary of a completed workflow.
 * Includes dramatic flair, French expressions, and natural language.
 */
export function formatWorkflowSummary(
  workflow: WorkflowDefinition,
  result: WorkflowResult,
): string {
  const completedSteps = result.steps.filter((s) => s.status === 'completed');
  const failedSteps = result.steps.filter((s) => s.status === 'failed');

  const opener = result.success
    ? pickRandom(FRANCK_SUCCESS_OPENERS)
    : pickRandom(FRANCK_FAILURE_OPENERS);

  let summary = `${workflow.icon} **${workflow.name}** \u2014 ${opener}\n\n`;

  // Describe completed steps in a more narrative style
  if (completedSteps.length > 0) {
    for (let i = 0; i < completedSteps.length; i++) {
      const step = completedSteps[i];
      const readable = summarizeToolResult(step.toolName, step.result ?? '{}');
      const stepNum = i + 1;
      summary += `**\u00C9tape ${stepNum} \u2014 ${step.label}:** ${readable}\n\n`;
    }
  }

  if (failedSteps.length > 0) {
    summary += `\n*Quelle horreur! ${failedSteps.length} step(s) encountered des probl\u00E8mes:*\n`;
    for (const step of failedSteps) {
      summary += `- **${step.label}:** ${step.error}\n`;
    }
    summary += '\n';
  }

  summary += `\n*${pickRandom(FRANCK_CLOSERS)}*`;

  return summary;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Returns all available workflows for the capabilities panel.
 */
export function getAvailableWorkflows(): {
  id: string;
  name: string;
  icon: string;
  description: string;
  triggerPhrases: string[];
}[] {
  return WORKFLOWS.map((w) => ({
    id: w.id,
    name: w.name,
    icon: w.icon,
    description: w.description,
    triggerPhrases: w.triggerPhrases,
  }));
}

/**
 * Returns all trigger phrases across all workflows.
 * Useful for autocomplete/suggestions in the UI.
 */
export function getAllTriggerPhrases(): string[] {
  const phrases: string[] = [];
  for (const workflow of WORKFLOWS) {
    for (const phrase of workflow.triggerPhrases) {
      phrases.push(phrase);
    }
  }
  return phrases;
}
