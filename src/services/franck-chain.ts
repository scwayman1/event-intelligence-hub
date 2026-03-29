/**
 * Franck Chain — ReAct-style Structured Agent Engine
 *
 * A deterministic planning and execution layer that intercepts known
 * user intents before they reach the LLM. For recognized patterns
 * (seat everyone, move guest, swap, optimize, etc.) it builds a
 * dependency-ordered task plan, executes tools sequentially, resolves
 * inter-step dependencies, and returns a verified result — all without
 * an LLM call.
 *
 * Unrecognized intents fall through to the existing LLM-based agent loop.
 */

import { executeTool } from './franck-tools';
import { useEventStore } from '@/data/store';

// ---------------------------------------------------------------------------
// 1. Types
// ---------------------------------------------------------------------------

export interface TaskStep {
  id: string;
  description: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  dependsOn?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  verification?: { check: string; passed: boolean };
}

export interface TaskPlan {
  id: string;
  goal: string;
  steps: TaskStep[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
}

export interface IntentClassification {
  intent: string;
  entities: {
    guestName?: string;
    guestName2?: string;
    tableNumber?: number;
    maxIterations?: number;
    updateFields?: Record<string, unknown>;
  };
}

type StoreState = ReturnType<typeof useEventStore.getState>;

export type ChainProgressCallback = (step: TaskStep) => void;

export interface ChainResult {
  handled: true;
  plan: TaskPlan;
  summary: string;
}

export interface ChainSkipped {
  handled: false;
}

// ---------------------------------------------------------------------------
// 2. Intent Classifier
// ---------------------------------------------------------------------------

/**
 * Classify the user's message into a known intent using keyword and regex
 * matching. Returns null if the intent is unrecognized.
 */
export function classifyIntent(message: string): IntentClassification | null {
  const msg = message.toLowerCase().trim();

  // ── "seat everyone" / "auto seat" / "assign all guests" ──
  if (
    /\b(seat\s*(every|all)|auto[- ]?seat|assign\s*(all|every)\s*guest)/i.test(msg)
  ) {
    return { intent: 'seat_all', entities: {} };
  }

  // ── "clear all seating" / "reset seating" / "unseat everyone" ──
  if (
    /\b(clear\s*(all)?\s*seat|reset\s*seat|unseat\s*(every|all)|remove\s*all\s*seat)/i.test(msg)
  ) {
    return { intent: 'clear_seating', entities: {} };
  }

  // ── "optimize seating" / "refine" / "auto-pilot" ──
  if (
    /\b(optimi[sz]e|refine|improve|auto[- ]?pilot)\s*(the\s*)?(seat|arrangement|layout)?/i.test(msg)
  ) {
    const iterMatch = msg.match(/(\d+)\s*iteration/);
    return {
      intent: 'optimize',
      entities: {
        maxIterations: iterMatch ? parseInt(iterMatch[1], 10) : undefined,
      },
    };
  }

  // ── "swap X and Y" ──
  const swapMatch = msg.match(
    /\bswap\s+([a-z][a-z\s]*?)\s+(?:and|with|&)\s+([a-z][a-z\s]*?)(?:\s*$|[.!?])/i,
  );
  if (swapMatch) {
    return {
      intent: 'swap_guests',
      entities: {
        guestName: swapMatch[1].trim(),
        guestName2: swapMatch[2].trim(),
      },
    };
  }

  // ── "move X to table Y" ──
  const moveMatch = msg.match(
    /\b(?:move|put|place|assign|seat)\s+([a-z][a-z\s]*?)\s+(?:to|at|on)\s+table\s*(\d+)/i,
  );
  if (moveMatch) {
    return {
      intent: 'move_guest',
      entities: {
        guestName: moveMatch[1].trim(),
        tableNumber: parseInt(moveMatch[2], 10),
      },
    };
  }

  // ── "who is at table N" / "what's on table N" / "show table N" ──
  const tableQueryMatch = msg.match(
    /\b(?:who\s*(?:is|'s)\s*(?:at|on)|what\s*(?:is|'s)\s*(?:at|on)|show\s*(?:me\s*)?|guests?\s*(?:at|on))\s*table\s*(\d+)/i,
  );
  if (tableQueryMatch) {
    return {
      intent: 'query_table',
      entities: { tableNumber: parseInt(tableQueryMatch[1], 10) },
    };
  }

  // ── "how is the event looking" / "event status" / "event summary" ──
  if (
    /\b(how\s*(?:is|'s)\s*(?:the\s*)?event|event\s*(?:status|summary|overview|health)|how\s*(?:are\s*)?(?:we|things)\s*looking)/i.test(msg)
  ) {
    return { intent: 'event_overview', entities: {} };
  }

  // ── "score seating" / "how's the seating" ──
  if (
    /\b(score\s*(?:the\s*)?seat|(?:how|what)\s*(?:is|'s)\s*(?:the\s*)?seat(?:ing)?\s*(?:score|rating|quality)?)/i.test(msg)
  ) {
    return { intent: 'score_seating', entities: {} };
  }

  // ── Unrecognized ──
  return null;
}

// ---------------------------------------------------------------------------
// 3. Plan Generator
// ---------------------------------------------------------------------------

let planCounter = 0;

function nextPlanId(): string {
  return `plan-${++planCounter}-${Date.now()}`;
}

function step(
  id: string,
  description: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  dependsOn?: string[],
): TaskStep {
  return {
    id,
    description,
    toolName,
    toolInput,
    dependsOn,
    status: 'pending',
  };
}

/**
 * Generate a deterministic execution plan for a classified intent.
 * Returns null for intents that should fall through to the LLM.
 */
export function generatePlan(
  _userMessage: string,
  _eventId: string,
  _storeState: StoreState,
  intent: IntentClassification,
): TaskPlan | null {
  const planId = nextPlanId();
  const now = Date.now();

  switch (intent.intent) {
    // ── Seat everyone ──
    case 'seat_all':
      return {
        id: planId,
        goal: 'Auto-seat all unassigned guests',
        steps: [
          step('s1', 'Get table layout', 'get_table_info', {}),
          step('s2', 'Auto-seat all guests', 'auto_seat_guests', {}, ['s1']),
          step('s3', 'Score the new arrangement', 'score_seating', {}, ['s2']),
        ],
        status: 'planning',
        startedAt: now,
      };

    // ── Move guest to table ──
    case 'move_guest':
      return {
        id: planId,
        goal: `Move ${intent.entities.guestName} to Table ${intent.entities.tableNumber}`,
        steps: [
          step('s1', `Search for guest "${intent.entities.guestName}"`, 'search_guests', {
            query: intent.entities.guestName ?? '',
          }),
          step('s2', 'Get table layout', 'get_table_info', {}),
          step(
            's3',
            `Move guest to Table ${intent.entities.tableNumber}`,
            'move_guest_to_table',
            {
              // guestId will be resolved from s1
              tableNumber: intent.entities.tableNumber,
            },
            ['s1', 's2'],
          ),
          step('s4', 'Score the arrangement', 'score_seating', {}, ['s3']),
        ],
        status: 'planning',
        startedAt: now,
      };

    // ── Swap two guests ──
    case 'swap_guests':
      return {
        id: planId,
        goal: `Swap ${intent.entities.guestName} and ${intent.entities.guestName2}`,
        steps: [
          step('s1', `Search for "${intent.entities.guestName}"`, 'search_guests', {
            query: intent.entities.guestName ?? '',
          }),
          step('s2', `Search for "${intent.entities.guestName2}"`, 'search_guests', {
            query: intent.entities.guestName2 ?? '',
          }),
          step(
            's3',
            'Swap the two guests',
            'swap_guests',
            {
              // guestId1 resolved from s1, guestId2 resolved from s2
            },
            ['s1', 's2'],
          ),
          step('s4', 'Score the arrangement', 'score_seating', {}, ['s3']),
        ],
        status: 'planning',
        startedAt: now,
      };

    // ── Optimize seating ──
    case 'optimize':
      return {
        id: planId,
        goal: 'Optimize the seating arrangement',
        steps: [
          step('s1', 'Score current arrangement', 'score_seating', {}),
          step(
            's2',
            'Run refinement loop',
            'run_refinement_loop',
            {
              maxIterations: intent.entities.maxIterations ?? 20,
            },
            ['s1'],
          ),
        ],
        status: 'planning',
        startedAt: now,
      };

    // ── Query table ──
    case 'query_table':
      return {
        id: planId,
        goal: `Show who is at Table ${intent.entities.tableNumber}`,
        steps: [
          step('s1', 'Get table information', 'get_table_info', {}),
        ],
        status: 'planning',
        startedAt: now,
      };

    // ── Event overview ──
    case 'event_overview':
      return {
        id: planId,
        goal: 'Get a comprehensive event overview',
        steps: [
          step('s1', 'Get event summary', 'get_event_summary', {}),
          step('s2', 'Flag issues', 'flag_issues', {}),
          step('s3', 'Score seating', 'score_seating', {}),
        ],
        status: 'planning',
        startedAt: now,
      };

    // ── Clear all seating ──
    case 'clear_seating':
      return {
        id: planId,
        goal: 'Clear all seating assignments',
        steps: [
          step('s1', 'Clear all seating assignments', 'clear_all_seating', {}),
        ],
        status: 'planning',
        startedAt: now,
      };

    // ── Score seating ──
    case 'score_seating':
      return {
        id: planId,
        goal: 'Score the current seating arrangement',
        steps: [
          step('s1', 'Score seating', 'score_seating', {}),
        ],
        status: 'planning',
        startedAt: now,
      };

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 4. Result Resolver — resolves inter-step dependencies
// ---------------------------------------------------------------------------

/**
 * Given completed predecessor steps, resolve dynamic inputs for a dependent step.
 * Mutates `step.toolInput` in place with resolved values.
 */
function resolveDependencies(
  currentStep: TaskStep,
  completedSteps: Map<string, TaskStep>,
): void {
  const deps = currentStep.dependsOn;
  if (!deps || deps.length === 0) return;

  const toolName = currentStep.toolName;

  // ── move_guest_to_table needs guestId from a search_guests step ──
  if (toolName === 'move_guest_to_table' && !currentStep.toolInput.guestId) {
    const guestId = extractGuestIdFromDeps(deps, completedSteps);
    if (guestId) {
      currentStep.toolInput.guestId = guestId;
    }
  }

  // ── swap_guests needs guestId1 and guestId2 from two search_guests steps ──
  if (toolName === 'swap_guests') {
    const searchSteps = deps
      .map((depId) => completedSteps.get(depId))
      .filter(
        (s): s is TaskStep =>
          s !== undefined && s.toolName === 'search_guests' && s.status === 'completed',
      );

    if (searchSteps.length >= 2 && !currentStep.toolInput.guestId1) {
      const id1 = extractGuestId(searchSteps[0]);
      const id2 = extractGuestId(searchSteps[1]);
      if (id1) currentStep.toolInput.guestId1 = id1;
      if (id2) currentStep.toolInput.guestId2 = id2;
    }
  }

  // ── update_guest needs guestId from a search_guests step ──
  if (toolName === 'update_guest' && !currentStep.toolInput.guestId) {
    const guestId = extractGuestIdFromDeps(deps, completedSteps);
    if (guestId) {
      currentStep.toolInput.guestId = guestId;
    }
  }
}

/** Extract the first guest ID from search_guests results among the given dependency step IDs. */
function extractGuestIdFromDeps(
  depIds: string[],
  completedSteps: Map<string, TaskStep>,
): string | null {
  for (const depId of depIds) {
    const depStep = completedSteps.get(depId);
    if (depStep?.toolName === 'search_guests' && depStep.status === 'completed') {
      const id = extractGuestId(depStep);
      if (id) return id;
    }
  }
  return null;
}

/** Parse the result JSON from a search_guests step and return the first match's id. */
function extractGuestId(searchStep: TaskStep): string | null {
  if (!searchStep.result) return null;
  try {
    const parsed = JSON.parse(searchStep.result) as {
      results?: Array<{ id: string }>;
    };
    if (parsed.results && parsed.results.length > 0) {
      return parsed.results[0].id;
    }
  } catch {
    // parse failure — leave unresolved
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Chain Executor
// ---------------------------------------------------------------------------

/**
 * Execute a TaskPlan step-by-step in dependency order.
 *
 * - Steps with no dependencies (or whose dependencies are all completed) run next.
 * - Results from predecessor steps feed into dependent steps via `resolveDependencies`.
 * - Calls `onProgress` after each step completes (or fails).
 * - If any step fails, the plan is marked as failed immediately.
 */
export async function executeChain(
  plan: TaskPlan,
  eventId: string,
  onProgress?: ChainProgressCallback,
): Promise<TaskPlan> {
  plan.status = 'executing';

  const completedSteps = new Map<string, TaskStep>();

  // Topological-ish execution: keep picking steps whose deps are satisfied
  const remaining = new Set(plan.steps.map((s) => s.id));

  while (remaining.size > 0) {
    // Find all steps that are ready to run
    const ready = plan.steps.filter(
      (s) =>
        remaining.has(s.id) &&
        (s.dependsOn ?? []).every((depId) => completedSteps.has(depId)),
    );

    if (ready.length === 0) {
      // No runnable steps but remaining exist — circular dependency or broken plan
      plan.status = 'failed';
      break;
    }

    // Execute ready steps sequentially (they may share state mutations)
    for (const currentStep of ready) {
      currentStep.status = 'running';

      // Resolve dependencies from prior step results
      resolveDependencies(currentStep, completedSteps);

      try {
        const storeState = useEventStore.getState();
        const result = await executeTool(
          currentStep.toolName,
          currentStep.toolInput,
          storeState,
          eventId,
        );

        currentStep.result = result;
        currentStep.status = 'completed';

        // Basic verification: check that the result is not an error
        const isError = resultIsError(result);
        currentStep.verification = {
          check: isError ? 'Tool returned an error' : 'Tool completed successfully',
          passed: !isError,
        };

        if (isError) {
          currentStep.status = 'failed';
          plan.status = 'failed';
          if (onProgress) onProgress(currentStep);
          return plan;
        }
      } catch (err) {
        currentStep.status = 'failed';
        currentStep.result = JSON.stringify({
          error: true,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
        currentStep.verification = { check: 'Tool threw an exception', passed: false };
        plan.status = 'failed';
        if (onProgress) onProgress(currentStep);
        return plan;
      }

      completedSteps.set(currentStep.id, currentStep);
      remaining.delete(currentStep.id);
      if (onProgress) onProgress(currentStep);
    }
  }

  if (plan.status !== 'failed') {
    plan.status = 'completed';
  }
  plan.completedAt = Date.now();

  return plan;
}

/** Check whether a JSON result string contains an error flag. */
function resultIsError(result: string): boolean {
  try {
    const parsed = JSON.parse(result) as { error?: boolean };
    return parsed.error === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 6. Summary Generator
// ---------------------------------------------------------------------------

/**
 * Build a concise human-readable summary of a completed (or failed) plan,
 * pulling key data from each step's result.
 */
function buildSummary(plan: TaskPlan): string {
  if (plan.status === 'failed') {
    const failedStep = plan.steps.find((s) => s.status === 'failed');
    const errorMsg = failedStep?.result
      ? extractMessage(failedStep.result)
      : 'Unknown error';
    return `Plan "${plan.goal}" failed at step "${failedStep?.description ?? '?'}": ${errorMsg}`;
  }

  const parts: string[] = [`Plan "${plan.goal}" completed successfully.`];

  for (const s of plan.steps) {
    if (!s.result) continue;
    const snippet = summarizeStepResult(s);
    if (snippet) parts.push(snippet);
  }

  const elapsed = plan.completedAt
    ? `(${plan.completedAt - plan.startedAt}ms)`
    : '';
  if (elapsed) parts.push(elapsed);

  return parts.join(' ');
}

function extractMessage(resultJson: string): string {
  try {
    const parsed = JSON.parse(resultJson) as { message?: string };
    return parsed.message ?? resultJson;
  } catch {
    return resultJson;
  }
}

function summarizeStepResult(s: TaskStep): string | null {
  if (!s.result) return null;
  try {
    const data = JSON.parse(s.result) as Record<string, unknown>;

    switch (s.toolName) {
      case 'auto_seat_guests':
        return `Seated ${data.applied ?? '?'} guests (score: ${(data.score as Record<string, unknown>)?.overall ?? '?'}).`;
      case 'score_seating': {
        const score = data.score as Record<string, unknown> | undefined;
        return `Seating score: ${score?.overall ?? '?'}/100.`;
      }
      case 'move_guest_to_table':
        return `Moved ${data.guestName ?? '?'} to ${data.tableName ?? '?'}.`;
      case 'swap_guests':
        return `Swapped ${(data.guest1 as Record<string, unknown>)?.name ?? '?'} and ${(data.guest2 as Record<string, unknown>)?.name ?? '?'}.`;
      case 'clear_all_seating':
        return `Cleared ${data.cleared ?? '?'} assignments.`;
      case 'run_refinement_loop':
        return `Refinement: ${data.initialScore ?? '?'} → ${data.finalScore ?? '?'} (${data.swapsApplied ?? 0} swaps, ${data.iterations ?? 0} iterations).`;
      case 'get_event_summary':
        return `Event: ${data.name ?? '?'} — ${data.guestCount ?? '?'} guests, ${data.confirmedCount ?? '?'} confirmed.`;
      case 'flag_issues':
        return `${data.issueCount ?? 0} issue(s) flagged (health: ${data.healthScore ?? '?'}).`;
      case 'search_guests': {
        const results = data.results as Array<{ displayName?: string }> | undefined;
        if (results && results.length > 0) {
          return `Found "${results[0].displayName ?? '?'}" (${data.resultCount ?? results.length} result${results.length !== 1 ? 's' : ''}).`;
        }
        return `No guests found for query "${data.query ?? '?'}".`;
      }
      case 'get_table_info':
        return `${data.totalTables ?? '?'} tables, ${data.seatedGuests ?? '?'} seated / ${data.totalCapacity ?? '?'} capacity.`;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 7. Public API — tryChainExecution
// ---------------------------------------------------------------------------

/**
 * Attempt to handle a user message via the deterministic chain engine.
 *
 * 1. Classify intent from the message text.
 * 2. If recognized, generate a plan and execute it.
 * 3. Return `{ handled: true, plan, summary }` on success.
 * 4. Return `{ handled: false }` if the intent is unrecognized, so the
 *    caller can fall back to the LLM-based agent.
 */
export async function tryChainExecution(
  userMessage: string,
  eventId: string,
  storeState: StoreState,
  onProgress?: ChainProgressCallback,
): Promise<ChainResult | ChainSkipped> {
  // Step 1: Classify
  const intent = classifyIntent(userMessage);
  if (!intent) {
    return { handled: false };
  }

  // Step 2: Generate plan
  const plan = generatePlan(userMessage, eventId, storeState, intent);
  if (!plan) {
    return { handled: false };
  }

  // Step 3: Execute
  const executedPlan = await executeChain(plan, eventId, onProgress);

  // Step 4: Summarize
  const summary = buildSummary(executedPlan);

  return {
    handled: true,
    plan: executedPlan,
    summary,
  };
}
