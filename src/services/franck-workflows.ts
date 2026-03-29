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
    id: 'quick-optimization',
    name: 'Quick Optimization',
    icon: '\u26A1',  // zap emoji
    description: 'Score current seating, get recommendations, and flag any issues',
    triggerPhrases: [
      'quick optimization',
      'optimize seating',
      'improve seating',
      'make seating better',
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
        label: 'Get recommendations',
        toolName: 'get_seating_recommendations',
        toolInput: { limit: 5 },
        status: 'pending',
      },
      {
        id: 'wo-3',
        label: 'Flag issues',
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
 * Match a user message to a workflow by checking trigger phrases.
 * Returns null if no workflow matches.
 */
export function matchWorkflow(userMessage: string): WorkflowMatch | null {
  const normalized = userMessage.toLowerCase().trim();

  for (const workflow of WORKFLOWS) {
    for (const phrase of workflow.triggerPhrases) {
      if (normalized === phrase || normalized.includes(phrase)) {
        return { workflow, params: {} };
      }
    }
  }

  return null;
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
export function formatWorkflowSummary(
  workflow: WorkflowDefinition,
  result: WorkflowResult,
): string {
  const completedSteps = result.steps.filter((s) => s.status === 'completed');
  const failedSteps = result.steps.filter((s) => s.status === 'failed');

  let summary = `${workflow.icon} **${workflow.name}** -- C'est magnifique! Franck has completed all the steps!\n\n`;

  for (const step of completedSteps) {
    let resultText = step.result ?? '';
    try {
      const parsed = JSON.parse(resultText);
      if (typeof parsed === 'object' && parsed !== null) {
        resultText = JSON.stringify(parsed, null, 2);
      }
    } catch {
      // keep as-is
    }
    summary += `### ${step.label}\n${resultText}\n\n`;
  }

  if (failedSteps.length > 0) {
    summary += `\n*Quelle horreur! ${failedSteps.length} step(s) had errors:*\n`;
    for (const step of failedSteps) {
      summary += `- ${step.label}: ${step.error}\n`;
    }
  }

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
