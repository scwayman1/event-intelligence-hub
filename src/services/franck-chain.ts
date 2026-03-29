/**
 * Franck Chain Engine — ReAct-style Task Planner & Chain Executor
 *
 * Decomposes complex user requests into multi-step chains of tool calls,
 * executing them in sequence with intermediate reasoning.
 *
 * TODO: This is a minimal stub. Another agent will replace this with
 * the full ReAct implementation.
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

    // Execute steps sequentially
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
        const storeState = useEventStore.getState();
        const result = await executeTool(step.toolName, step.toolInput, storeState, eventId);
        step.status = 'completed';
        step.result = result;
        toolCalls.push({ name: step.toolName, result });
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

/**
 * Format a human-readable summary of chain execution results.
 */
function formatChainSummary(description: string, steps: ChainStep[]): string {
  const completedSteps = steps.filter((s) => s.status === 'completed');
  const failedSteps = steps.filter((s) => s.status === 'failed');

  let summary = `**${description}** -- Franck has gathered all the details!\n\n`;

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
    summary += `### ${step.description}\n${resultText}\n\n`;
  }

  if (failedSteps.length > 0) {
    summary += `\n*${failedSteps.length} step(s) encountered errors.*\n`;
  }

  return summary;
}

/**
 * Returns known chain pattern descriptions (for the capabilities panel).
 */
export function getChainCapabilities(): { description: string; triggerExample: string }[] {
  return CHAIN_PATTERNS.map((p) => ({
    description: p.description,
    triggerExample: p.pattern.source.replace(/[\\^$()|\[\]{}?+*]/g, '').slice(0, 40),
  }));
}
