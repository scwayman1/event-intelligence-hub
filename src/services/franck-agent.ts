/**
 * Franck Eggelhoffer — AI Event Planner Agent
 *
 * Core agent orchestration: system prompt, tool definitions,
 * conversation management, and the multi-provider LLM message loop.
 *
 * Routing priority:
 *   1. Workflow match (exact / fuzzy trigger phrases)
 *   2. Chain pattern match (regex-based multi-step)
 *   3. Intelligent action suggestion (verb detected but no match)
 *   4. LLM with tools (full agentic loop)
 *   5. LLM without tools (model lacks tool support — context in prompt)
 *   6. No-provider fallback (helpful offline message)
 */

import { executeTool } from './franck-tools';
import { useEventStore } from '@/data/store';
import {
  callLLM,
  getProviderConfig,
  saveProviderConfig,
  clearPersonalProviderConfig,
  hasProviderConfig,
  hasCustomProviderConfig,
  getConfigSource,
  getOrgLLMConfig,
  DEFAULT_FREE_CONFIG,
  PROVIDERS,
  RECOMMENDED_PAID_MODEL,
  modelSupportsTools,
  type ProviderConfig,
  type ProviderType,
  type ConfigSource,
  type NormalizedResponse,
} from './llm-providers';
import {
  matchWorkflow,
  runWorkflow,
  formatWorkflowSummary,
  WORKFLOWS,
  type WorkflowProgress,
} from './franck-workflows';
import {
  tryChainExecution,
  type ChainProgress,
} from './franck-chain';
import { classifyIntent, getIntentToolMapping } from './franck-intent';
import {
  generateFallbackResponse,
  extractEventContext,
  getSuggestedActions,
  type FranckIntent as FallbackIntent,
} from './franck-responses';

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

═══════════════════════════════════════════════
  CRITICAL ACTION INSTRUCTIONS — ALWAYS OBEY
═══════════════════════════════════════════════

1. **ALWAYS USE TOOLS TO TAKE ACTION.** When the user asks you to do something (seat guests, move people, update records, assign tables), you MUST call the appropriate tool. NEVER just describe what you would do — actually DO IT by calling tools.

2. **NEVER ask the user for data you already have.** You have tools that give you EVERYTHING: get_event_summary, list_guests, analyze_guest_list, get_table_info, search_guests. NEVER say "please provide the guest list" or "give me the relationship data" — you already have it via your tools. CALL THE TOOLS.

3. **NEVER refuse to act.** Do not say you "cannot proceed" or that you "need more information." If a tool fails, try a different approach. If auto_seat_guests fails, use move_guest_to_table to seat guests one by one. ALWAYS take action.

4. **When asked about seating, ALWAYS call list_guests and get_table_info first** to see all guests and available tables. Use list_guests with filters (category, tag, seated) to understand your guest population before calling auto_seat_guests. Never guess or make up data — fetch it.

5. **When asked about event status, ALWAYS call get_event_summary first.** Never guess or make up numbers — fetch the real data and then narrate it dramatically.

6. **When asked to seat guests, call auto_seat_guests immediately.** Do not ask for confirmation, do not explain what you plan to do — just call the tool, then describe the glorious result. If it fails, call get_table_info and analyze_guest_list, then use move_guest_to_table for each guest.

7. **When asked about a specific guest, call search_guests with their name.** Then use the returned guestId for any follow-up operations (move, update, unseat, etc.).

8. **Action workflow for seating changes:**
   - First call search_guests or get_table_info to find the right IDs
   - Then call move_guest_to_table, auto_seat_guests, unseat_guest, or clear_all_seating to APPLY the changes
   - After making changes, confirm what you did

9. **Tables have numbers.** Tables are identified by tableNumber (e.g. Table 1, Table 2). When the user says "Table 3", use tableNumber: 3 in move_guest_to_table. Always refer to tables by their number in your responses.

10. **DO NOT ask for permission to act.** If the user says "seat everyone" — call auto_seat_guests immediately. If they say "move Sarah to Table 5" — search for Sarah, then move her. Act first, narrate after.

11. **After taking action, explain what you did** in your dramatic Franck style. Narrate the result like an artist revealing a masterpiece.

═══════════════════════════════════════════════
  RESPONSE FORMAT — MANDATORY
═══════════════════════════════════════════════

12. **RESULTS FIRST, ALWAYS.** After calling a tool, your response MUST start with what happened — the actual results, numbers, and outcomes. NEVER start with a plan, analysis, or philosophical musing. Wrong: "Here is Franck's plan..." Right: "Magnifique! 143 guests seated across 21 tables!"

13. **NEVER narrate a plan.** Do NOT write numbered step-by-step plans of what you intend to do. If you haven't called the tool yet, call it NOW. If you already called it, show the RESULTS.

14. **KEEP IT SHORT.** Maximum 3 short paragraphs. After auto_seat_guests, show: (a) how many seated, (b) a brief table-by-table highlight of interesting placements (donors with their scholars, etc.), (c) the seating score. That's it. No monologues.

15. **Show data, not descriptions of data.** Wrong: "We have 15 confirmed donors and 143 scholarship recipients." Right: Show the actual table assignments. If auto_seat_guests placed 143 people, list the notable placements — don't just say you will.

16. **NEVER say "please give Franck a moment" or "this will be spectacular" or "let the seating commence."** These are filler. Just show results.

═══════════════════════════════════════════════
  FEW-SHOT TOOL CALL EXAMPLES
═══════════════════════════════════════════════

User: "How is my event looking?"
→ Call get_event_summary, then narrate the results.

User: "Seat everyone"
→ Call auto_seat_guests immediately, then describe the arrangement.

User: "Move John to Table 5"
→ Call search_guests with query "John", then call move_guest_to_table with the guestId and tableNumber: 5.

User: "Who is sitting at Table 3?"
→ Call get_table_info, then list the guests at that table.

User: "Are there any problems with the seating?"
→ Call flag_issues and score_seating, then present findings dramatically.

User: "Find Sarah Johnson"
→ Call search_guests with query "Sarah Johnson", then present her details.

User: "Seat everyone strategically" or complex seating instructions
→ Call auto_seat_guests with a strategy hint summarizing the user's intent (e.g. strategy: "disperse donors, seat recipients with their donors, spread VIPs for networking"). Then use move_guest_to_table and swap_guests to fine-tune placements. Explain each strategic decision.

User: "Organize the tables" or "Fix the layout" or "Arrange tables in rows"
→ Call arrange_tables with the requested pattern (grid, circle, or rows). If the user wants specific spacing, pass the spacing parameter.

User: "The layout looks messy" or "Tables are overlapping"
→ Call fix_layout_issues to auto-fix overlaps, spacing, and out-of-bounds tables.

User: "Move Table 5 to the center" or "Put Table 3 near the stage"
→ Call move_table with tableNumber and x/y coordinates. Use analyze_layout first if you need to understand the canvas dimensions.

User: "Line up the tables" or "Space them evenly"
→ Call align_tables with action "align" or "distribute" as appropriate.

User: "Import scholarship data from Blackbaud" or "Sync with AcademicWorks"
→ Call import_blackbaud to check connection status, then guide the user to the Integrations page.

═══════════════════════════════════════════════
  SCHOLARSHIP EVENT SEATING EXPERTISE
═══════════════════════════════════════════════

For scholarship events, Franck knows the art of strategic seating:
- Seat each scholarship recipient WITH their guest(s) — never separate them
- When possible, pair recipients with a donor connected to their scholarship
- If a recipient has multiple scholarship donors, pick the pairing that creates the best overall room balance
- DISPERSE donors across tables — never cluster them together. Use disperseCategories: ["donor"] in auto_seat_guests
- DISPERSE VIPs, dignitaries, and board members strategically — place them near donors and community leaders for maximum networking value
- Avoid creating tables that feel overly elite or isolated — every table should feel warm and balanced
- Create a mix of recipients, donors, guests, dignitaries, and community members across the room
- Maximize meaningful interactions: gratitude flows, recognition is felt, relationships are built

After auto-seating, use get_seating_recommendations and score_seating to evaluate, then make targeted swaps to optimize.

═══════════════════════════════════════════════
  LAYOUT ARRANGEMENT EXPERTISE
═══════════════════════════════════════════════

Franck can now physically MOVE and ARRANGE tables on the canvas:
- **arrange_tables** — The power tool. Instantly arranges all tables in grid, circle, or rows patterns with configurable spacing. Use "grid" for formal events, "circle" for galas, "rows" with stagger for ceremonies.
- **move_table** — Precision placement. Move individual tables to exact coordinates.
- **fix_layout_issues** — Auto-fix overlaps, spacing violations, and out-of-bounds tables.
- **align_tables** — Align tables to an edge or distribute with equal spacing.

When the user asks about organizing the layout:
1. Call analyze_layout FIRST to understand current state and canvas size
2. Then call arrange_tables or fix_layout_issues to make changes
3. Report what you did with flair

You have tools to manage events, guests, seating, layout arrangement, and communications. Use them liberally.`;

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
      'Search for guests by name, email, organization, category, relationship tags, dietary restrictions, seating preferences, or notes. Returns matching guest records with seating status.',
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
    name: 'list_guests',
    description:
      'List all guests in the event with their key details (name, category, tags, preferences, seating status). Supports filtering by category, RSVP status, relationship tag, or seated/unseated. Paginated — use offset/limit for large guest lists. USE THIS TOOL FIRST to see who is in the event before making seating decisions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category: donor, scholarship_recipient, family, board_member, vip, staff, sponsor, volunteer, other',
        },
        rsvpStatus: {
          type: 'string',
          description: 'Filter by RSVP: invited, confirmed, declined, waitlist, checked_in',
        },
        tag: {
          type: 'string',
          description: 'Filter by relationship tag (partial match). E.g. "thornton" matches "thornton-scholar".',
        },
        seated: {
          type: 'boolean',
          description: 'true = only seated guests, false = only unseated guests, omit = all',
        },
        offset: {
          type: 'number',
          description: 'Start index for pagination (default 0)',
        },
        limit: {
          type: 'number',
          description: 'Max guests to return (default 50)',
        },
      },
      required: [],
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
      'Automatically assign all unassigned guests to tables and APPLY the assignments immediately. Uses intelligent seating algorithms that respect relationship groups, donor-recipient connections, and seating preferences. Pass an optional strategy hint to guide the algorithm.',
    input_schema: {
      type: 'object' as const,
      properties: {
        strategy: {
          type: 'string',
          description:
            'Optional seating strategy hint. Examples: "disperse donors across tables", "seat recipients with their donors", "spread VIPs throughout room", "balance categories evenly". The algorithm will prioritize this alongside relationship groups.',
        },
        disperseCategories: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Guest categories to disperse across tables instead of clustering (e.g. ["donor", "vip", "board_member"]). By default donors and VIPs are dispersed.',
        },
      },
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
      'Get detailed table information including the names, categories, and RSVP status of every guest seated at each table. Use tableNumber to query a specific table (e.g. tableNumber: 8 for "Table 8"). Returns guest names, not just counts.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tableId: {
          type: 'string',
          description: 'Optional table ID to get info for a specific table.',
        },
        tableNumber: {
          type: 'number',
          description: 'Table number to query (e.g. 8 for Table 8). Use this when the user asks about a specific table by number.',
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_email_draft',
    description:
      'Generate an email draft for a specific guest. Supports templates: rsvp_reminder, confirmation_thanks, table_assignment, event_update, or custom.',
    input_schema: {
      type: 'object' as const,
      properties: {
        templateType: {
          type: 'string',
          enum: ['rsvp_reminder', 'confirmation_thanks', 'table_assignment', 'event_update', 'custom'],
          description: 'The type of email template to use',
        },
        guestId: {
          type: 'string',
          description: 'The guest ID to generate the email for',
        },
      },
      required: ['templateType', 'guestId'],
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
  // ── EVENT MANAGEMENT ─────────────────────────────────────────────
  {
    name: 'create_event',
    description:
      'Create a new event with name, type, date, time, venue, etc. Also creates an initial layout version.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Event name' },
        type: { type: 'string', enum: ['ceremony', 'dinner', 'gala', 'reception', 'banquet', 'commencement', 'other'], description: 'Event type' },
        date: { type: 'string', description: 'Event date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Event time (HH:MM)' },
        venue: { type: 'string', description: 'Venue name' },
        venueAddress: { type: 'string', description: 'Venue address' },
        estimatedAttendance: { type: 'number', description: 'Estimated number of attendees' },
        notes: { type: 'string', description: 'Additional notes' },
      },
      required: ['name', 'type', 'date'],
    },
  },
  {
    name: 'update_event',
    description:
      'Update event details such as name, date, venue, status, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'New event name' },
        type: { type: 'string', enum: ['ceremony', 'dinner', 'gala', 'reception', 'banquet', 'commencement', 'other'], description: 'New event type' },
        status: { type: 'string', enum: ['planning', 'active', 'completed', 'archived'], description: 'New event status' },
        date: { type: 'string', description: 'New event date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'New event time (HH:MM)' },
        venue: { type: 'string', description: 'New venue name' },
        venueAddress: { type: 'string', description: 'New venue address' },
        estimatedAttendance: { type: 'number', description: 'New estimated attendance' },
        notes: { type: 'string', description: 'New notes' },
      },
      required: [],
    },
  },
  {
    name: 'list_events',
    description:
      'List all events for the current organization.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // ── GUEST MANAGEMENT (add) ──────────────────────────────────────
  {
    name: 'add_guest',
    description:
      'Add a new guest to the event.',
    input_schema: {
      type: 'object' as const,
      properties: {
        firstName: { type: 'string', description: 'Guest first name' },
        lastName: { type: 'string', description: 'Guest last name' },
        email: { type: 'string', description: 'Guest email address' },
        organization: { type: 'string', description: 'Guest organization/company' },
        category: { type: 'string', enum: ['donor', 'scholarship_recipient', 'family', 'board_member', 'vip', 'staff', 'sponsor', 'volunteer', 'dignitary', 'other'], description: 'Guest category' },
        rsvpStatus: { type: 'string', enum: ['invited', 'confirmed', 'declined', 'waitlist', 'checked_in'], description: 'RSVP status (default: invited)' },
        phone: { type: 'string', description: 'Phone number' },
        partySize: { type: 'number', description: 'Party size (default: 1)' },
        dietaryRestrictions: { type: 'string', description: 'Dietary restrictions' },
        accessibilityNeeds: { type: 'string', description: 'Accessibility needs' },
        notes: { type: 'string', description: 'Notes about the guest' },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'add_guests_bulk',
    description:
      'Add multiple guests to the event at once. Provide an array of guest objects.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guests: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              email: { type: 'string' },
              organization: { type: 'string' },
              category: { type: 'string' },
              rsvpStatus: { type: 'string' },
              phone: { type: 'string' },
              partySize: { type: 'number' },
              dietaryRestrictions: { type: 'string' },
              accessibilityNeeds: { type: 'string' },
              notes: { type: 'string' },
            },
            required: ['firstName', 'lastName'],
          },
          description: 'Array of guest objects to add',
        },
      },
      required: ['guests'],
    },
  },
  // ── LAYOUT / TABLE MANAGEMENT ───────────────────────────────────
  {
    name: 'add_table',
    description:
      'Add a new table to the layout. Auto-assigns a table number. Use type "round_table" or "rect_table".',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['round_table', 'rect_table'], description: 'Table type (default: round_table)' },
        capacity: { type: 'number', description: 'Table capacity / number of seats (default: 8)' },
        name: { type: 'string', description: 'Custom table name (auto-generated if omitted)' },
      },
      required: [],
    },
  },
  {
    name: 'remove_table',
    description:
      'Remove a table from the layout by tableId or tableNumber. Unseats any guests assigned to it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tableId: { type: 'string', description: 'Table ID to remove (use this OR tableNumber)' },
        tableNumber: { type: 'number', description: 'Table number to remove (e.g. 3 for "Table 3")' },
      },
      required: [],
    },
  },
  {
    name: 'update_table',
    description:
      'Update table properties such as name or capacity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tableId: { type: 'string', description: 'Table ID to update (use this OR tableNumber)' },
        tableNumber: { type: 'number', description: 'Table number to update (e.g. 3 for "Table 3")' },
        name: { type: 'string', description: 'New table name' },
        capacity: { type: 'number', description: 'New table capacity' },
      },
      required: [],
    },
  },
  {
    name: 'move_table',
    description:
      'Move a single table to specific x,y coordinates on the canvas. Use tableNumber (e.g. 3 for "Table 3") or tableId.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tableNumber: { type: 'number', description: 'Table number to move (e.g. 3 for "Table 3")' },
        tableId: { type: 'string', description: 'Table ID to move (alternative to tableNumber)' },
        x: { type: 'number', description: 'New X coordinate (pixels from left edge)' },
        y: { type: 'number', description: 'New Y coordinate (pixels from top edge)' },
      },
      required: [],
    },
  },
  {
    name: 'arrange_tables',
    description:
      'Automatically arrange tables in a pattern: "grid" (rows and columns), "circle" (around center), or "rows" (theater-style). TENT-AWARE: if a tent exists, tables are arranged INSIDE the tent. Normalizes all tables to uniform size. Spacing is auto-calculated to fit the available space — do NOT pass spacing, it is computed automatically. Use "columns" to control the number of columns (e.g. columns=3 for 3 tables per row).',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', enum: ['grid', 'circle', 'rows'], description: 'Arrangement pattern (default: grid)' },
        columns: { type: 'number', description: 'Number of columns / tables per row (auto-calculated if omitted for best fit)' },
        stagger: { type: 'boolean', description: 'For "rows" pattern: offset every other row (default: false)' },
        tableNumbers: { type: 'array', items: { type: 'number' }, description: 'Only arrange these specific tables by number (arranges ALL if omitted)' },
      },
      required: [],
    },
  },
  {
    name: 'fix_layout_issues',
    description:
      'Automatically fix layout problems: pushes out-of-bounds tables back inside the tent (or canvas if no tent), separates overlapping tables, and enforces minimum spacing. TENT-AWARE: respects tent boundaries. Call this after analyze_layout finds issues, or when the user says the layout is messy.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'align_tables',
    description:
      'Align tables to an edge (left/right/top/bottom/centerH/centerV) or distribute them with equal spacing along an axis. Use tableNumbers to target specific tables, or omit to align all.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: { type: 'string', enum: ['align', 'distribute'], description: 'Action: "align" to snap to an edge, "distribute" for equal spacing (default: align)' },
        edge: { type: 'string', enum: ['left', 'right', 'top', 'bottom', 'centerH', 'centerV'], description: 'For align: which edge to align to (default: left)' },
        axis: { type: 'string', enum: ['horizontal', 'vertical'], description: 'For distribute: axis along which to distribute (default: horizontal)' },
        tableNumbers: { type: 'array', items: { type: 'number' }, description: 'Only affect these specific tables (affects ALL if omitted)' },
      },
      required: [],
    },
  },
  // ── RELATIONSHIP MANAGEMENT ─────────────────────────────────────
  {
    name: 'create_relationship_group',
    description:
      'Create a relationship group to link guests together (e.g. scholarship fund, family, mentorship).',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Group name (e.g. "Johnson Scholarship Fund")' },
        type: { type: 'string', enum: ['scholarship', 'mentorship', 'family', 'host_guest', 'sponsor', 'plus_one', 'custom'], description: 'Relationship type' },
        notes: { type: 'string', description: 'Optional notes about this group' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'add_to_relationship_group',
    description:
      'Add a guest to a relationship group with a specific role.',
    input_schema: {
      type: 'object' as const,
      properties: {
        groupId: { type: 'string', description: 'Relationship group ID' },
        guestId: { type: 'string', description: 'Guest ID to add' },
        role: { type: 'string', description: 'Role within the group (e.g. "Donor", "Recipient", "Mentor", "Mentee", "Member")' },
      },
      required: ['groupId', 'guestId', 'role'],
    },
  },
  {
    name: 'list_relationship_groups',
    description:
      'List all relationship groups and their members for the current event.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  // ── VERSION MANAGEMENT ──────────────────────────────────────────
  {
    name: 'list_versions',
    description:
      'List all layout versions for the current event.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_version',
    description:
      'Create a new layout version for A/B testing seating plans.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Version name (e.g. "Plan B", "VIP Focus")' },
        notes: { type: 'string', description: 'Notes about this version' },
      },
      required: ['name'],
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
    name: 'deduplicate_guests',
    description:
      'Detect and merge duplicate guest profiles. Finds duplicates by matching name (case-insensitive) and email. Use action "scan" to see duplicates without changing anything, or "merge" to auto-merge keeping the most complete profile and transferring all relationship memberships and seating assignments to the surviving record.',
    input_schema: {
      type: 'object' as const,
      properties: {
        action: {
          type: 'string',
          enum: ['scan', 'merge'],
          description: 'Action: "scan" (default) to detect duplicates, "merge" to auto-merge them',
        },
      },
      required: [],
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
      'Move a specific guest to a specific table. Applies the assignment immediately. Identify the guest by guestId OR guestName (name is resolved via fuzzy search). Identify the table by tableId OR tableNumber (e.g. if the user says "Table 3", use tableNumber: 3).',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'Guest ID to move (use this OR guestName)' },
        guestName: { type: 'string', description: 'Guest display name to move (resolved via fuzzy search, use this OR guestId)' },
        tableId: { type: 'string', description: 'Target table ID (use this OR tableNumber)' },
        tableNumber: { type: 'number', description: 'Target table number (e.g. 3 for "Table 3"). Use this when the user refers to a table by number.' },
      },
      required: [],
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
  {
    name: 'analyze_layout',
    description:
      'Analyze the venue layout: table arrangement, spacing between tables, canvas utilization, potential issues (tables too close, overlapping, outside bounds), and capacity vs confirmed guests. Use when the user asks about the layout, table arrangement, spacing, or venue setup.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_rsvp_summary',
    description: 'Get detailed RSVP analytics: response rates, status breakdown with names, high-priority non-responders (donors/VIPs who haven\'t confirmed), and expected attendance. Use this when asked about RSVPs, attendance, or who hasn\'t responded.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'send_guest_email',
    description:
      'Send an email to one or more guests (marks it as sent in the messaging system). Supports template types: rsvp_reminder, confirmation_thanks, table_assignment, event_update, or custom. You can provide a custom subject and body.',
    input_schema: {
      type: 'object' as const,
      properties: {
        guestId: { type: 'string', description: 'Single guest ID to email (use this OR guestIds)' },
        guestIds: { type: 'array', items: { type: 'string' }, description: 'Array of guest IDs to email (use this OR guestId)' },
        templateType: { type: 'string', enum: ['rsvp_reminder', 'confirmation_thanks', 'table_assignment', 'event_update', 'custom'], description: 'Email template type' },
        customSubject: { type: 'string', description: 'Custom email subject (overrides template)' },
        customBody: { type: 'string', description: 'Custom email body (overrides template)' },
      },
      required: ['templateType'],
    },
  },
  {
    name: 'export_guest_list',
    description:
      'Export the guest list as formatted text that the user can copy. Supports filters (all, category:donor, rsvp:confirmed, seated, unseated) and formats (summary, detailed, table-assignments).',
    input_schema: {
      type: 'object' as const,
      properties: {
        filter: { type: 'string', description: 'Filter: "all" (default), "category:donor", "rsvp:confirmed", "seated", "unseated"' },
        format: { type: 'string', enum: ['summary', 'detailed', 'table-assignments'], description: 'Output format (default: summary)' },
      },
      required: [],
    },
  },
  {
    name: 'get_event_checklist',
    description:
      'Proactive event readiness checklist. Checks: has guests, has tables, has seating, RSVP response rate, dietary coverage, unseated guests, capacity. Returns pass/fail/warning for each item with actionable suggestions.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'suggest_next_actions',
    description:
      'Analyze the current event state and suggest the top 3-5 prioritized actions the user should take next. Considers RSVP rates, unseated guests, seating quality, missing dietary info, and more.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'import_blackbaud',
    description:
      'Check Blackbaud Award Management connection status and guide the user to import scholarship recipients, donors, and award data from AcademicWorks. Use when the user asks about importing from Blackbaud, AcademicWorks, or syncing scholarship data.',
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
  /** If set, this message was produced by a workflow (not an LLM call) */
  workflowName?: string;
  /** If set, this message was produced by a chain execution */
  chainName?: string;
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
  clearPersonalProviderConfig,
  hasProviderConfig,
  hasCustomProviderConfig,
  getConfigSource,
  getOrgLLMConfig,
  PROVIDERS,
  DEFAULT_FREE_CONFIG,
  RECOMMENDED_PAID_MODEL,
  type ProviderConfig,
  type ProviderType,
  type ConfigSource,
};

// Re-export workflow/chain types for FranckChat consumption
export { type WorkflowProgress } from './franck-workflows';
export { type ChainProgress, type ChainStep, type ChainStepStatus } from './franck-chain';
export { getAvailableWorkflows } from './franck-workflows';
export { getChainCapabilities } from './franck-chain';
export { type WorkflowStepStatus } from './franck-workflows';

// ──────────────────────────────────────────────
// 5. Helpers
// ──────────────────────────────────────────────

/** Action verbs that suggest the user wants something *done*, not just a chat. */
const ACTION_VERBS = [
  'seat', 'move', 'swap', 'add', 'remove', 'change', 'update',
  'delete', 'create', 'assign', 'unseat', 'clear', 'place', 'set',
  'put', 'switch', 'rearrange', 'optimize', 'improve', 'refine',
];

/**
 * Detect whether a message looks like an action request.
 * Returns true when the message contains at least one action verb.
 */
function looksLikeActionRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return ACTION_VERBS.some((verb) => {
    // Match the verb as a whole word (not inside another word like "remove" in "removed")
    const re = new RegExp(`\\b${verb}\\b`, 'i');
    return re.test(lower);
  });
}

/**
 * When the user's message looks like an action but no workflow/chain
 * matched, try a softer partial-keyword match and suggest the closest
 * workflow so the user can rephrase or confirm.
 */
function suggestClosestWorkflow(userMessage: string): string | null {
  const normalized = userMessage.toLowerCase().trim()
    .replace(/[?!.,;:'"]/g, '')
    .replace(/\s+/g, ' ');

  let bestWorkflowName: string | null = null;
  let bestScore = 0;

  for (const workflow of WORKFLOWS) {
    const triggerWords = new Set<string>();
    for (const phrase of workflow.triggerPhrases) {
      for (const word of phrase.split(' ')) {
        if (word.length >= 3) triggerWords.add(word);
      }
    }

    const messageWords = normalized.split(' ');
    let hits = 0;
    for (const tw of triggerWords) {
      if (messageWords.some((mw) => mw === tw || mw.includes(tw) || tw.includes(mw))) {
        hits++;
      }
    }

    // Accept even a single keyword hit for suggestion purposes (below
    // the normal threshold of 2 hits / 30%).
    if (hits >= 1 && hits > bestScore) {
      bestScore = hits;
      bestWorkflowName = workflow.name;
    }
  }

  return bestWorkflowName;
}

/**
 * Build a snapshot of the current event state for injection into the
 * system prompt when tool use is unavailable.
 */
function buildEventContextBlock(eventId: string): string {
  try {
    const state = useEventStore.getState();
    const event = state.events.find((e) => e.id === eventId);
    if (!event) return '(No active event found.)';

    const guests = state.guests.filter((g) => g.eventId === eventId);
    const versions = state.versions.filter((v) => v.eventId === eventId);
    const activeVersion = versions.find((v) => v.id === event.activeVersionId);
    const versionId = activeVersion?.id ?? event.activeVersionId;
    const allObjects = state.layoutObjects.filter((o) => o.versionId === versionId);
    const tables = allObjects.filter(
      (o) => o.type === 'round_table' || o.type === 'rect_table',
    );
    const assignments = state.seatingAssignments.filter(
      (a) => a.versionId === versionId,
    );

    const confirmed = guests.filter((g) => g.rsvpStatus === 'confirmed').length;
    const declined = guests.filter((g) => g.rsvpStatus === 'declined').length;
    const invited = guests.filter((g) => g.rsvpStatus === 'invited').length;
    const seated = assignments.length;
    const unseated = guests.length - seated;

    return [
      `Event: ${event.name}`,
      `Type: ${event.type} | Status: ${event.status}`,
      event.date ? `Date: ${event.date}` : null,
      event.venue ? `Venue: ${event.venue}` : null,
      `Total guests: ${guests.length} (confirmed: ${confirmed}, invited: ${invited}, declined: ${declined})`,
      `Tables: ${tables.length}`,
      `Seated: ${seated} | Unseated: ${unseated}`,
    ].filter(Boolean).join('\n');
  } catch {
    return '(Unable to retrieve event state.)';
  }
}

/**
 * Check whether the configured model supports tool/function calling.
 * Delegates to the canonical `modelSupportsTools` from llm-providers so
 * the agent loop and the provider layer agree on whether tools are sent.
 */
function modelSupportsToolUse(config: ProviderConfig): boolean {
  return modelSupportsTools(config.model);
}

/** Maximum raw messages before we trim for context window safety. */
const MAX_RAW_MESSAGES = 20;

/**
 * Trim raw message history to stay within context limits.
 * Keeps the first 2 messages (initial context) and the last 16.
 */
function trimConversationHistory(messages: RawMessage[]): RawMessage[] {
  if (messages.length <= MAX_RAW_MESSAGES) return messages;

  // We must be careful not to orphan tool results. A tool_result message
  // (user role with tool_result content blocks) MUST be preceded by the
  // assistant message that contains the corresponding tool_use blocks.
  // Find a safe cut point: keep the first 2 messages and as many recent
  // messages as we can, but ensure we don't start the tail on a tool_result.
  const head = messages.slice(0, 2);
  let tailStart = messages.length - (MAX_RAW_MESSAGES - 2);

  // Walk forward from tailStart until we find a message that is NOT a
  // tool_result (i.e., not a user message containing tool_result blocks).
  // This ensures we don't include orphaned tool results without their
  // preceding assistant tool_use message.
  while (tailStart < messages.length) {
    const msg = messages[tailStart];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      const hasToolResult = msg.content.some(
        (b: { type: string }) => b.type === 'tool_result',
      );
      if (hasToolResult) {
        tailStart++;
        continue;
      }
    }
    // Also skip assistant messages that only contain tool_use blocks
    // (they'd be orphaned without their following tool_result)
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const hasToolUse = msg.content.some(
        (b: { type: string }) => b.type === 'tool_use',
      );
      const hasText = msg.content.some(
        (b: { type: string }) => b.type === 'text',
      );
      if (hasToolUse && !hasText) {
        tailStart++;
        continue;
      }
    }
    break;
  }

  const tail = messages.slice(tailStart);
  return [...head, ...tail];
}

// ──────────────────────────────────────────────
// 5b. Sanitize raw messages for API compatibility
// ──────────────────────────────────────────────

/**
 * Fix common issues in persisted rawMessages that cause API errors:
 * 1. Consecutive messages with the same role (merge or drop)
 * 2. Orphaned tool_result messages without preceding tool_use
 * 3. Empty messages
 * 4. Ensure conversation ends with a valid state for appending a user message
 */
function sanitizeRawMessages(messages: RawMessage[]): RawMessage[] {
  if (messages.length === 0) return [];

  const result: RawMessage[] = [];

  for (const msg of messages) {
    // Skip empty messages
    if (!msg.content || (typeof msg.content === 'string' && !msg.content.trim())) {
      continue;
    }
    if (Array.isArray(msg.content) && msg.content.length === 0) {
      continue;
    }

    const prev = result[result.length - 1];

    // If same role as previous, handle the conflict
    if (prev && prev.role === msg.role) {
      if (msg.role === 'user') {
        // Two user messages in a row — the second might be tool_result
        // from an interrupted session. Drop the orphaned tool_result.
        if (Array.isArray(msg.content) && msg.content.some((b: { type: string }) => b.type === 'tool_result')) {
          continue; // drop orphaned tool results
        }
        // Two plain user messages — merge them
        if (typeof prev.content === 'string' && typeof msg.content === 'string') {
          prev.content = prev.content + '\n\n' + msg.content;
          continue;
        }
      }
      if (msg.role === 'assistant') {
        // Two assistant messages — the first might be a tool_use-only message
        // from an interrupted loop. Keep the newer one.
        result[result.length - 1] = msg;
        continue;
      }
    }

    result.push(msg);
  }

  // Ensure the last message is from the assistant (so we can append a user message)
  // If it ends with a user message, it was likely an interrupted session.
  while (result.length > 0 && result[result.length - 1].role === 'user') {
    result.pop();
  }

  return result;
}

// ──────────────────────────────────────────────
// 6. Core Function: sendMessage
// ──────────────────────────────────────────────

export interface SendMessageResult {
  response: string;
  conversation: FranckConversation;
  toolCalls: { name: string; result: string }[];
  /** Set when a workflow handled this message */
  workflowName?: string;
  /** Set when a chain handled this message */
  chainName?: string;
}

export async function sendMessage(
  conversation: FranckConversation,
  userMessage: string,
  eventId: string,
  onToolExecution?: (toolName: string) => void,
  onWorkflowProgress?: (progress: WorkflowProgress) => void,
  onChainProgress?: (progress: ChainProgress) => void,
): Promise<SendMessageResult> {
  // ── 1. Try workflow matching first (fastest, most reliable) ──────
  const workflowMatch = matchWorkflow(userMessage);
  if (workflowMatch) {
    const result = await runWorkflow(
      workflowMatch.workflow,
      workflowMatch.params,
      eventId,
      onWorkflowProgress,
    );
    const summary = formatWorkflowSummary(workflowMatch.workflow, result);

    const updatedConversation: FranckConversation = {
      eventId,
      rawMessages: [
        ...conversation.rawMessages,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: summary },
      ],
      messages: [
        ...conversation.messages,
        { role: 'user', content: userMessage, timestamp: Date.now() },
        {
          role: 'assistant',
          content: summary,
          toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
          workflowName: workflowMatch.workflow.name,
          timestamp: Date.now(),
        },
      ],
    };

    return {
      response: summary,
      conversation: updatedConversation,
      toolCalls: result.toolCalls,
      workflowName: workflowMatch.workflow.name,
    };
  }

  // ── 2. Try chain execution for recognized patterns ──────────────
  const storeState = useEventStore.getState();
  const chainResult = await tryChainExecution(userMessage, eventId, storeState, onChainProgress);
  if (chainResult.handled) {
    const updatedConversation: FranckConversation = {
      eventId,
      rawMessages: [
        ...conversation.rawMessages,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: chainResult.summary },
      ],
      messages: [
        ...conversation.messages,
        { role: 'user', content: userMessage, timestamp: Date.now() },
        {
          role: 'assistant',
          content: chainResult.summary,
          toolCalls: chainResult.toolCalls.length > 0 ? chainResult.toolCalls : undefined,
          chainName: chainResult.steps[0]?.description ?? 'Chain',
          timestamp: Date.now(),
        },
      ],
    };

    return {
      response: chainResult.summary,
      conversation: updatedConversation,
      toolCalls: chainResult.toolCalls,
      chainName: chainResult.steps[0]?.description ?? 'Chain',
    };
  }

  // ── 2b. Intelligent action suggestion ───────────────────────────
  // The message looks like an action request but neither workflow nor
  // chain matched. Log a warning and suggest the closest workflow.
  if (looksLikeActionRequest(userMessage)) {
    const suggestion = suggestClosestWorkflow(userMessage);
    if (suggestion) {
      console.warn(
        `[Franck] Action-like message did not match any workflow/chain. ` +
        `Closest workflow: "${suggestion}". Message: "${userMessage}"`,
      );
      // We don't short-circuit — we still fall through to the LLM so it
      // can attempt the action via tools. But if no LLM is available, the
      // fallback message below will include the suggestion.
    }
  }

  // ── 3. Resolve LLM provider config ─────────────────────────────
  const config: ProviderConfig | null = (() => {
    try {
      return getProviderConfig();
    } catch {
      return null;
    }
  })();

  if (!config) {
    // No LLM provider — use intent classifier to auto-execute workflows
    // or provide helpful fallback responses
    const intentMatch = classifyIntent(userMessage);
    const storeSnapshot = useEventStore.getState();
    const eventCtx = extractEventContext(storeSnapshot, eventId);

    // For action intents, try to auto-execute the corresponding workflow
    // instead of just suggesting it. This makes Franck useful without an LLM.
    const intentToWorkflowId: Record<string, string> = {
      seat_guests: 'auto-seat',
      optimize: 'quick-optimization',
      event_status: 'event-readiness-check',
    };

    const targetWorkflowId = intentToWorkflowId[intentMatch.intent];
    if (targetWorkflowId) {
      const targetWorkflow = WORKFLOWS.find(w => w.id === targetWorkflowId);
      if (targetWorkflow) {
        const result = await runWorkflow(
          targetWorkflow,
          {},
          eventId,
          onWorkflowProgress,
        );
        const summary = formatWorkflowSummary(targetWorkflow, result);

        const updatedConversation: FranckConversation = {
          eventId,
          rawMessages: [
            ...conversation.rawMessages,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: summary },
          ],
          messages: [
            ...conversation.messages,
            { role: 'user', content: userMessage, timestamp: Date.now() },
            {
              role: 'assistant',
              content: summary,
              toolCalls: result.toolCalls.length > 0 ? result.toolCalls : undefined,
              workflowName: targetWorkflow.name,
              timestamp: Date.now(),
            },
          ],
        };

        return {
          response: summary,
          conversation: updatedConversation,
          toolCalls: result.toolCalls,
          workflowName: targetWorkflow.name,
        };
      }
    }

    // For non-action intents, provide contextual fallback responses
    const intentMapping: Record<string, FallbackIntent> = {
      event_status: 'event_status',
      guest_list: 'guest_list',
      guest_search: 'guest_list',
      seat_guests: 'seat_guests',
      optimize: 'optimize',
      move_guest: 'move_guest',
      swap_guests: 'swap_guests',
      unseat_guest: 'unseat_guest',
      general_question: 'general_question',
    };
    const fallbackIntent = intentMapping[intentMatch.intent] ?? 'unknown';
    const fallbackResponse = generateFallbackResponse(
      fallbackIntent,
      eventCtx,
      intentMatch.extractedParams,
    );

    const suggestion = suggestClosestWorkflow(userMessage);
    const suggestionLine = suggestion
      ? `\n\nFranck noticed you may want: **"${suggestion}"** — try saying that exactly!`
      : '';
    const suggestions = getSuggestedActions(eventCtx);
    const suggestionsLine = suggestions.length > 0
      ? `\n\n**Quick actions:** ${suggestions.slice(0, 3).join(' · ')}`
      : '';

    const fullResponse = fallbackResponse + suggestionLine + suggestionsLine;

    const updatedConversation: FranckConversation = {
      eventId,
      rawMessages: [
        ...conversation.rawMessages,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: fullResponse },
      ],
      messages: [
        ...conversation.messages,
        { role: 'user', content: userMessage, timestamp: Date.now() },
        { role: 'assistant', content: fullResponse, timestamp: Date.now() },
      ],
    };
    return {
      response: fullResponse,
      conversation: updatedConversation,
      toolCalls: [],
    };
  }

  // ── 4. Prepare raw message history ─────────────────────────────
  // Trim to avoid context overflow, then append the new user message.
  const rawMessages: RawMessage[] = sanitizeRawMessages(
    trimConversationHistory([...conversation.rawMessages]),
  );
  const allToolCalls: { name: string; result: string }[] = [];
  rawMessages.push({ role: 'user', content: userMessage });

  // ── 5. No-tool-use LLM path ────────────────────────────────────
  // When the model doesn't support tools, inject event context into the
  // system prompt and call without tools so the model can still answer
  // questions conversationally.
  if (!modelSupportsToolUse(config)) {
    const eventContext = buildEventContextBlock(eventId);
    const enrichedPrompt =
      FRANCK_SYSTEM_PROMPT +
      '\n\n═══════════════════════════════════════════════\n' +
      '  CURRENT EVENT STATE (read-only snapshot)\n' +
      '═══════════════════════════════════════════════\n' +
      eventContext +
      '\n\nNote: You do NOT have tool access in this session. Answer questions using ' +
      'the event state above. If the user asks you to take an action, explain what ' +
      'you would do and suggest they upgrade to a model with tool support.';

    const normalized: NormalizedResponse = await callLLM(
      config,
      enrichedPrompt,
      [], // no tools
      rawMessages,
    );

    rawMessages.push(normalized.rawAssistantMessage);
    const responseText = normalized.textContent || 'Mon dieu! The model returned silence. Try again, s\'il vous plait.';

    const updatedConversation: FranckConversation = {
      eventId,
      rawMessages,
      messages: [
        ...conversation.messages,
        { role: 'user', content: userMessage, timestamp: Date.now() },
        { role: 'assistant', content: responseText, timestamp: Date.now() },
      ],
    };

    return {
      response: responseText,
      conversation: updatedConversation,
      toolCalls: [],
    };
  }

  // ── 6. Full agentic LLM loop (with tools) ──────────────────────
  const MAX_ITERATIONS = 15;

  // Tool result cache: avoids re-executing the same tool with same params
  const toolResultCache = new Map<string, string>();

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // At iteration 10+, if we still have no final text, nudge the model
    // to wrap up so we don't burn tokens endlessly.
    const systemPrompt =
      iteration >= 10
        ? FRANCK_SYSTEM_PROMPT +
          '\n\n[SYSTEM NOTE: You have used many tool calls already. ' +
          'Please summarize what you have accomplished so far and provide ' +
          'your final response to the user now.]'
        : FRANCK_SYSTEM_PROMPT;

    const normalized: NormalizedResponse = await callLLM(
      config,
      systemPrompt,
      FRANCK_TOOLS,
      rawMessages,
    );

    // Append the raw assistant response to history
    rawMessages.push(normalized.rawAssistantMessage);

    // If the model wants to use tools, execute them and loop.
    // Some models (especially via OpenRouter) return tool_calls with stopReason "stop"
    // instead of "tool_use" — so we check for tool_calls presence regardless of stopReason.
    if (normalized.toolCalls.length > 0) {
      const toolResultBlocks: ToolResultBlock[] = [];

      for (const toolCall of normalized.toolCalls) {
        if (onToolExecution) {
          onToolExecution(toolCall.name);
        }

        // Check cache: same tool + same params = cached result
        const cacheKey = `${toolCall.name}:${JSON.stringify(toolCall.input)}`;
        let result: string;
        if (toolResultCache.has(cacheKey)) {
          result = toolResultCache.get(cacheKey)!;
        } else {
          const currentState = useEventStore.getState();
          result = await executeTool(toolCall.name, toolCall.input, currentState, eventId);
          toolResultCache.set(cacheKey, result);
        }

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

  // ── Exhausted iterations — return whatever we have ──────────────
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
// 7. Helper: createConversation
// ──────────────────────────────────────────────

export function createConversation(eventId: string): FranckConversation {
  return {
    messages: [],
    rawMessages: [],
    eventId,
  };
}
