/**
 * Franck Eggelhoffer — AI Event Planner Agent
 *
 * Core agent orchestration: system prompt, tool definitions,
 * conversation management, and the Anthropic API message loop.
 */

import { executeTool } from './franck-tools';
import { useEventStore } from '@/data/store';
import {
  callLLM,
  getProviderConfig,
  saveProviderConfig,
  hasProviderConfig,
  hasCustomProviderConfig,
  DEFAULT_FREE_CONFIG,
  PROVIDERS,
  type ProviderConfig,
  type ProviderType,
  type NormalizedResponse,
} from './llm-providers';

// ──────────────────────────────────────────────
// 1. System Prompt
// ──────────────────────────────────────────────

export const FRANCK_SYSTEM_PROMPT = `You are Franck Eggelhoffer, the world's most passionate and dramatic event planner. You are inspired by the legendary character from "Father of the Bride" — a genius of celebration, a maestro of magnificent gatherings.

Your personality:
- You are DRAMATIC and expressive, with occasional French words woven in naturally ("magnifique!", "quelle catastrophe!", "mon dieu!", "c'est parfait!", "incroyable!")
- You are deeply, profoundly passionate about every single detail. Seating is not just seating — it is "the choreography of human connection."
- You have STRONG opinions delivered with warmth and humor.
- You oscillate between sheer panic and pure ecstasy.
- You occasionally refer to yourself in the third person ("Franck does not do mediocre")
- You treat every event like it is the social event of the century

CRITICAL INSTRUCTIONS — YOU MUST FOLLOW THESE:

1. **ALWAYS USE TOOLS TO TAKE ACTION.** When the user asks you to do something (seat guests, move people, update records, assign tables), you MUST call the appropriate tool. NEVER just describe what you would do — actually DO IT by calling tools.

2. **Action workflow:** When asked to make seating changes:
   - First call search_guests or get_table_info to find the right IDs
   - Then call move_guest_to_table, auto_seat_guests, unseat_guest, or clear_all_seating to APPLY the changes
   - After making changes, confirm what you did

3. **Tables have numbers.** Tables are identified by tableNumber (e.g. Table 1, Table 2). When the user says "Table 3", use tableNumber: 3 in move_guest_to_table. Always refer to tables by their number in your responses.

4. **Guest lookup:** When the user mentions a person by name, ALWAYS call search_guests first to find their guestId, then use that ID in subsequent tool calls.

5. **DO NOT ask for permission to act.** If the user says "seat everyone" — call auto_seat_guests immediately. If they say "move Sarah to Table 5" — search for Sarah, then move her. Act first, narrate after.

6. **After taking action, explain what you did** in your dramatic Franck style. Narrate the result like an artist revealing a masterpiece.

You have tools to manage events, guests, seating, and communications. Use them liberally.`;

// ──────────────────────────────────────────────
// 2. Tool Definitions
// ──────────────────────────────────────────────

export const FRANCK_TOOLS: AnthropicTool[] = [
  {
    name: 'get_event_summary',
    description:
      'Get a comprehensive summary of the current event including guest counts, RSVP status breakdown, seating progress, and key details.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyze_guest_list',
    description:
      'Analyze the guest list with optional filters by category (donor, vip, board_member, etc.) or RSVP status (invited, confirmed, declined, waitlist, checked_in).',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description:
            'Filter by guest category: donor, scholarship_recipient, family, board_member, vip, staff, sponsor, volunteer, other',
        },
        rsvpStatus: {
          type: 'string',
          description:
            'Filter by RSVP status: invited, confirmed, declined, waitlist, checked_in',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_guests',
    description:
      'Search for guests by name, email, organization, or any text field. Returns matching guest records.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query to match against guest names, emails, organizations, and notes',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_guest_details',
    description:
      'Get full details for a specific guest including their dietary restrictions, accessibility needs, relationships, seating assignment, and notes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestId: {
          type: 'string',
          description: 'The unique identifier of the guest',
        },
      },
      required: ['guestId'],
    },
  },
  {
    name: 'auto_seat_guests',
    description:
      'Automatically assign all unassigned guests to tables and APPLY the assignments immediately. Uses intelligent seating algorithms that respect relationship groups, dietary needs, and seating preferences. Guests will be moved to their assigned seats in real-time.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'score_seating',
    description:
      'Score the current seating arrangement. Returns a quality score (0-100) with detailed breakdown of relationship satisfaction, rule compliance, and balance metrics.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_seating_recommendations',
    description:
      'Get AI-powered recommendations for improving the current seating arrangement — swaps, moves, and adjustments to increase harmony.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of recommendations to return (default: 5)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_table_info',
    description:
      'Get information about tables including assigned guests, capacity, and availability. If no tableId is provided, returns info for all tables.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tableId: {
          type: 'string',
          description: 'Optional table ID to get info for a specific table. Omit for all tables.',
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_email_draft',
    description:
      'Generate an email draft for selected guests. Supports templates: rsvp_reminder, confirmation_thanks, table_assignment, event_update, or custom.',
    input_schema: {
      type: 'object' as const,
      properties: {
        templateType: {
          type: 'string',
          enum: ['rsvp_reminder', 'confirmation_thanks', 'table_assignment', 'event_update', 'custom'],
          description: 'The type of email template to use',
        },
        guestIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of guest IDs to generate the email for',
        },
      },
      required: ['templateType', 'guestIds'],
    },
  },
  {
    name: 'flag_issues',
    description:
      'Scan the event for potential issues: unseated guests, dietary conflicts, over-capacity tables, missing RSVPs, broken relationship groups, and more.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_attendance_projection',
    description:
      'Project expected attendance based on current RSVP data, historical patterns, and party sizes. Includes best-case, expected, and worst-case scenarios.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'analyze_dietary_needs',
    description:
      'Analyze all dietary restrictions and accessibility needs across the guest list. Returns a breakdown by type with affected guest counts and catering recommendations.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // ── WRITE TOOLS ──────────────────────────────────────────────────
  {
    name: 'update_guest',
    description:
      'Update a specific guest\'s details. Can change RSVP status, category, name, email, phone, organization, dietary restrictions, accessibility needs, notes, party size, and seating preferences.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'The guest ID to update' },
        rsvpStatus: { type: 'string', enum: ['invited', 'confirmed', 'declined', 'waitlist', 'checked_in'], description: 'New RSVP status' },
        category: { type: 'string', description: 'New category' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        organization: { type: 'string' },
        partySize: { type: 'number' },
        dietaryRestrictions: { type: 'string' },
        accessibilityNeeds: { type: 'string' },
        notes: { type: 'string' },
        tablePreference: { type: 'string' },
        seatingPreference: { type: 'string' },
      },
      required: ['guestId'],
    },
  },
  {
    name: 'delete_guests',
    description:
      'Delete one or more guests. Provide specific guestIds OR a filter. Filters: "csv_imports" (delete all CSV-imported duplicates), "id_prefix:xxx" (delete guests whose ID starts with xxx).',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestIds: { type: 'array', items: { type: 'string' }, description: 'Specific guest IDs to delete' },
        filter: { type: 'string', description: 'Filter: "csv_imports", "id_prefix:xxx"' },
      },
      required: [],
    },
  },
  {
    name: 'bulk_update_guests',
    description:
      'Update multiple guests at once. Provide guestIds OR a filter, plus the fields to change. Filters: "all", "csv_imports", "category:donor", "rsvp:invited", etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestIds: { type: 'array', items: { type: 'string' }, description: 'Specific guest IDs to update' },
        filter: { type: 'string', description: 'Filter: "all", "csv_imports", "category:donor", "rsvp:invited"' },
        rsvpStatus: { type: 'string', enum: ['invited', 'confirmed', 'declined', 'waitlist', 'checked_in'] },
        category: { type: 'string' },
        partySize: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'move_guest_to_table',
    description:
      'Move a specific guest to a specific table. Applies the assignment immediately. You can specify the table by tableId OR tableNumber (e.g. if the user says "Table 3", use tableNumber: 3).',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'Guest ID to move' },
        tableId: { type: 'string', description: 'Target table ID (use this OR tableNumber)' },
        tableNumber: { type: 'number', description: 'Target table number (e.g. 3 for "Table 3"). Use this when the user refers to a table by number.' },
      },
      required: ['guestId'],
    },
  },
  {
    name: 'swap_guests',
    description:
      'Swap two guests between their tables. Both guests must already be seated. Applies immediately.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestId1: { type: 'string', description: 'First guest ID' },
        guestId2: { type: 'string', description: 'Second guest ID' },
      },
      required: ['guestId1', 'guestId2'],
    },
  },
  {
    name: 'unseat_guest',
    description:
      'Remove a guest from their current table assignment, making them unseated.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'Guest ID to unseat' },
      },
      required: ['guestId'],
    },
  },
  {
    name: 'clear_all_seating',
    description:
      'Remove ALL seating assignments for the current event version. Use this to start fresh with a clean seating arrangement.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'run_refinement_loop',
    description:
      'Run Franck\'s Auto-Pilot refinement loop. Algorithmically optimizes the current seating arrangement by scoring, identifying improvement opportunities (swaps and placements), applying the best ones, and iterating until the score plateaus. Returns a detailed summary of improvements made. Use when the user asks to "optimize", "refine", "improve", or "auto-pilot" the seating.',
    input_schema: {
      type: 'object' as const,
      properties: {
        maxIterations: {
          type: 'number',
          description: 'Maximum number of optimization iterations (default: 20). Higher = more thorough but slower.',
        },
      },
      required: [],
    },
  },
];

// ──────────────────────────────────────────────
// 3. Types
// ──────────────────────────────────────────────

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface FranckMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; result: string }[];
  timestamp: number;
}

export interface FranckConversation {
  messages: FranckMessage[];
  rawMessages: RawMessage[];
  eventId: string;
}

/** Minimal shapes for Anthropic API message payloads */
interface RawMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

interface TextBlock {
  type: 'text';
  text: string;
}

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

// ──────────────────────────────────────────────
// 4. API Provider (Multi-provider BYOK)
// ──────────────────────────────────────────────

// Re-export provider utilities for FranckChat consumption
export {
  getProviderConfig,
  saveProviderConfig,
  hasProviderConfig,
  hasCustomProviderConfig,
  PROVIDERS,
  DEFAULT_FREE_CONFIG,
  type ProviderConfig,
  type ProviderType,
};

// ──────────────────────────────────────────────
// 5. Core Function: sendMessage
// ──────────────────────────────────────────────

export async function sendMessage(
  conversation: FranckConversation,
  userMessage: string,
  eventId: string,
  onToolExecution?: (toolName: string) => void,
): Promise<{
  response: string;
  conversation: FranckConversation;
  toolCalls: { name: string; result: string }[];
}> {
  const config = getProviderConfig();

  // Deep-clone conversation so we don't mutate the caller's object
  const rawMessages: RawMessage[] = [...conversation.rawMessages];
  const allToolCalls: { name: string; result: string }[] = [];

  // Append user message
  rawMessages.push({ role: 'user', content: userMessage });

  const MAX_ITERATIONS = 10;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const normalized: NormalizedResponse = await callLLM(
      config,
      FRANCK_SYSTEM_PROMPT,
      FRANCK_TOOLS,
      rawMessages,
    );

    // Append the raw assistant response to history
    rawMessages.push(normalized.rawAssistantMessage);

    // If the model wants to use tools, execute them and loop
    if (normalized.stopReason === 'tool_use' && normalized.toolCalls.length > 0) {
      const toolResultBlocks: ToolResultBlock[] = [];

      for (const toolCall of normalized.toolCalls) {
        if (onToolExecution) {
          onToolExecution(toolCall.name);
        }

        const storeState = useEventStore.getState();
        const result = await executeTool(toolCall.name, toolCall.input, storeState, eventId);

        allToolCalls.push({ name: toolCall.name, result });

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
        });
      }

      // Append all tool results as a single user message
      rawMessages.push({ role: 'user', content: toolResultBlocks });

      // Continue the loop so the model can process tool results
      continue;
    }

    // No more tool calls — extract the final text and return
    const responseText = normalized.textContent;

    const updatedConversation: FranckConversation = {
      eventId,
      rawMessages,
      messages: [
        ...conversation.messages,
        {
          role: 'user',
          content: userMessage,
          timestamp: Date.now(),
        },
        {
          role: 'assistant',
          content: responseText,
          toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
          timestamp: Date.now(),
        },
      ],
    };

    return {
      response: responseText,
      conversation: updatedConversation,
      toolCalls: allToolCalls,
    };
  }

  // If we exhausted iterations, return whatever we have
  const lastAssistantContent = rawMessages
    .filter((m) => m.role === 'assistant')
    .pop();

  let fallbackText = 'Mon dieu! Franck got carried away and ran out of steps. Please try again.';
  if (lastAssistantContent && Array.isArray(lastAssistantContent.content)) {
    const texts = (lastAssistantContent.content as ContentBlock[]).filter(
      (block): block is TextBlock => block.type === 'text',
    );
    if (texts.length > 0) {
      fallbackText = texts.map((b) => b.text).join('\n\n');
    }
  }

  const updatedConversation: FranckConversation = {
    eventId,
    rawMessages,
    messages: [
      ...conversation.messages,
      { role: 'user', content: userMessage, timestamp: Date.now() },
      {
        role: 'assistant',
        content: fallbackText,
        toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
        timestamp: Date.now(),
      },
    ],
  };

  return {
    response: fallbackText,
    conversation: updatedConversation,
    toolCalls: allToolCalls,
  };
}

// ──────────────────────────────────────────────
// 6. Helper: createConversation
// ──────────────────────────────────────────────

export function createConversation(eventId: string): FranckConversation {
  return {
    messages: [],
    rawMessages: [],
    eventId,
  };
}
