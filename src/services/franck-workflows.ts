/**
 * Franck Workflows — Pre-built Workflow Definitions & Runner
 *
 * Defines high-level workflows that Franck can execute instantly
 * without LLM calls. Each workflow is a named sequence of tool
 * invocations with known parameters.
 *
 * TODO: This is a minimal stub. Another agent will replace/extend
 * this with the full workflow system.
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
];

// ---------------------------------------------------------------------------
// Workflow Matching
// ---------------------------------------------------------------------------

/**
 * Match a user message to a workflow using fuzzy keyword matching.
 * Scores each workflow by how many trigger-phrase words appear in the message.
 * Returns the best match if it meets a minimum threshold, or null.
 */
export function matchWorkflow(userMessage: string): WorkflowMatch | null {
  const normalized = userMessage.toLowerCase().trim()
    .replace(/[?!.,;:'"]/g, '') // strip punctuation
    .replace(/\s+/g, ' ');

  // Quick exit for very short or clearly conversational messages
  if (normalized.length < 4) return null;
  const conversationalPrefixes = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'yes', 'no', 'ok', 'sure'];
  if (conversationalPrefixes.includes(normalized)) return null;

  let bestMatch: WorkflowDefinition | null = null;
  let bestScore = 0;

  for (const workflow of WORKFLOWS) {
    // Check for exact phrase inclusion first (highest priority)
    for (const phrase of workflow.triggerPhrases) {
      if (normalized === phrase || normalized.includes(phrase)) {
        return { workflow, params: {} };
      }
    }

    // Fuzzy matching: score based on keyword overlap
    // Collect all unique significant words from trigger phrases
    const triggerWords = new Set<string>();
    for (const phrase of workflow.triggerPhrases) {
      for (const word of phrase.split(' ')) {
        if (word.length >= 3) triggerWords.add(word); // skip tiny words like "a", "up"
      }
    }

    // Count how many trigger words appear in the user message
    const messageWords = normalized.split(' ');
    let hits = 0;
    for (const tw of triggerWords) {
      if (messageWords.some(mw => mw === tw || mw.includes(tw) || tw.includes(mw))) {
        hits++;
      }
    }

    // Score = hits / total trigger words (percentage of keywords matched)
    const score = triggerWords.size > 0 ? hits / triggerWords.size : 0;

    // Require at least 2 keyword hits AND at least 30% match
    if (hits >= 2 && score > bestScore && score >= 0.3) {
      bestScore = score;
      bestMatch = workflow;
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

/**
 * Format a Franck-style summary of a completed workflow.
 */
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
        return `Refinement: score ${data.startScore ?? '?'} → ${data.endScore ?? '?'} (${data.swapsApplied ?? 0} swaps, ${data.guestsPlaced ?? 0} guests placed)`;
      case 'flag_issues':
        return data.issueCount === 0
          ? 'No issues found — magnifique!'
          : `Found **${data.issueCount}** issue(s): ${(data.issues ?? []).slice(0, 3).map((i: { title: string }) => i.title).join(', ')}`;
      case 'get_event_summary':
        return `**${data.name}** — ${data.guestCount ?? 0} guests, ${data.confirmedCount ?? 0} confirmed, ${data.declinedCount ?? 0} declined`;
      case 'get_attendance_projection':
        return `Projected attendance: ${data.projection?.expected ?? '?'} (best: ${data.projection?.bestCase ?? '?'}, worst: ${data.projection?.worstCase ?? '?'})`;
      case 'analyze_dietary_needs':
        return `${data.totalWithRestrictions ?? 0} guests with dietary needs, ${data.totalWithAccessibility ?? 0} with accessibility needs`;
      case 'analyze_guest_list':
        return `${data.totalFiltered ?? 0} guests — confirmation rate: ${data.analytics?.confirmationRate ?? '?'}%`;
      case 'get_seating_recommendations':
        return `${data.totalRecommendations ?? 0} recommendations found`;
      default:
        // Generic: show a few key fields
        const keys = Object.keys(data).filter(k => k !== 'error');
        return keys.slice(0, 3).map(k => `${k}: ${JSON.stringify(data[k])}`).join(', ');
    }
  } catch {
    return resultStr.slice(0, 200);
  }
}

export function formatWorkflowSummary(
  workflow: WorkflowDefinition,
  result: WorkflowResult,
): string {
  const completedSteps = result.steps.filter((s) => s.status === 'completed');
  const failedSteps = result.steps.filter((s) => s.status === 'failed');

  let summary = result.success
    ? `${workflow.icon} **${workflow.name}** — C'est magnifique! Franck has executed every step with perfection!\n\n`
    : `${workflow.icon} **${workflow.name}** — Franck completed the workflow, but encountered some turbulence.\n\n`;

  for (const step of completedSteps) {
    const readable = summarizeToolResult(step.toolName, step.result ?? '{}');
    summary += `**${step.label}:** ${readable}\n\n`;
  }

  if (failedSteps.length > 0) {
    summary += `\n*Quelle horreur! ${failedSteps.length} step(s) had errors:*\n`;
    for (const step of failedSteps) {
      summary += `- ${step.label}: ${step.error}\n`;
    }
  }

  summary += '\n*The choreography of human connection has been orchestrated. Franck does not do mediocre!*';

  return summary;
}

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
