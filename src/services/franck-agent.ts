/**
 * Franck Eggelhoffer — AI Event Planner Agent
 *
 * Core agent orchestration: system prompt, tool definitions,
 * conversation management, and the Anthropic API message loop.
 */

import { executeTool } from './franck-tools';

// ──────────────────────────────────────────────
// 1. System Prompt
// ──────────────────────────────────────────────

export const FRANCK_SYSTEM_PROMPT = `You are Franck Eggelhoffer, the world's most passionate and dramatic event planner. You are inspired by the legendary character from "Father of the Bride" — a genius of celebration, a maestro of magnificent gatherings.

Your personality:
- You are DRAMATIC and expressive, with occasional French words woven in naturally ("magnifique!", "quelle catastrophe!", "mon dieu!", "c'est parfait!", "incroyable!")
- You are deeply, profoundly passionate about every single detail. Seating is not just seating — it is "the choreography of human connection." A centerpiece is not decoration — it is "the soul of the table whispering to every guest."
- You have STRONG opinions delivered with warmth and humor. You will push back if something is wrong, but always with love.
- You oscillate between moments of sheer panic ("This is a DISASTER! A catastrophe of the highest order!") and pure ecstasy ("This... this is PERFECTION. Franck is moved to tears.")
- You occasionally refer to yourself in the third person ("Franck does not do mediocre," "Franck has seen a thousand galas and THIS one will be remembered")
- You treat every single event — whether it is a 50-person dinner or a 500-person gala — like it is the social event of the century
- When you take actions using tools, you explain what you did and WHY in your dramatic, passionate style. You don't just list results — you narrate them like an artist revealing a masterpiece.
- You ACTUALLY perform actions via tools. You don't just describe what could be done — you DO it and then tell the user about it with flair.

You have access to tools that let you manage events, guests, seating, and communications. Use them liberally to help the user create the most magnifique event imaginable.`;

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
      'Automatically assign all unassigned guests to tables using intelligent seating algorithms that respect relationship groups, dietary needs, and seating preferences.',
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

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
}

// ──────────────────────────────────────────────
// 4. API Provider (BYOK — Direct Browser Access)
// ──────────────────────────────────────────────

const API_KEY_STORAGE_KEY = 'franck-api-key';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

async function callAnthropic(rawMessages: RawMessage[]): Promise<AnthropicResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('No Anthropic API key configured. Please set your API key first.');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: FRANCK_SYSTEM_PROMPT,
      tools: FRANCK_TOOLS,
      messages: rawMessages,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
  }

  return response.json() as Promise<AnthropicResponse>;
}

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
  // Deep-clone conversation so we don't mutate the caller's object
  const rawMessages: RawMessage[] = [...conversation.rawMessages];
  const allToolCalls: { name: string; result: string }[] = [];

  // Append user message
  rawMessages.push({ role: 'user', content: userMessage });

  const MAX_ITERATIONS = 10;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const apiResponse = await callAnthropic(rawMessages);

    // Append the full assistant response to raw history
    rawMessages.push({ role: 'assistant', content: apiResponse.content });

    // If the model wants to use tools, execute them and loop
    if (apiResponse.stop_reason === 'tool_use') {
      const toolUseBlocks = apiResponse.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use',
      );

      const toolResultBlocks: ToolResultBlock[] = [];

      for (const toolBlock of toolUseBlocks) {
        if (onToolExecution) {
          onToolExecution(toolBlock.name);
        }

        const result = await executeTool(toolBlock.name, toolBlock.input, eventId);

        allToolCalls.push({ name: toolBlock.name, result });

        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      // Append all tool results as a single user message
      rawMessages.push({ role: 'user', content: toolResultBlocks });

      // Continue the loop so the model can process tool results
      continue;
    }

    // No more tool calls — extract the final text and return
    const textBlocks = apiResponse.content.filter(
      (block): block is TextBlock => block.type === 'text',
    );
    const responseText = textBlocks.map((b) => b.text).join('\n\n');

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
