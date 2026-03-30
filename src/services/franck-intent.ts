/**
 * Franck Intent Classification System
 *
 * Classifies user messages into intents using keyword matching, regex patterns,
 * and simple NLP heuristics. No LLM call required.
 *
 * Self-contained module with zero imports from other franck-* files.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FranckIntent =
  | 'seat_guests'
  | 'move_guest'
  | 'swap_guests'
  | 'unseat_guest'
  | 'event_status'
  | 'guest_search'
  | 'guest_list'
  | 'table_info'
  | 'seating_score'
  | 'optimize'
  | 'dietary_check'
  | 'issues_check'
  | 'email_draft'
  | 'add_guest'
  | 'add_table'
  | 'remove_table'
  | 'clear_seating'
  | 'general_question'
  | 'unknown';

export interface IntentMatch {
  intent: FranckIntent;
  confidence: number;
  extractedParams: Record<string, string>;
  suggestedTool?: string;
}

// ---------------------------------------------------------------------------
// Internal types for pattern definitions
// ---------------------------------------------------------------------------

interface IntentRule {
  intent: FranckIntent;
  /** Regex patterns — a match adds `patternWeight` to the score. */
  patterns: RegExp[];
  patternWeight: number;
  /** Simple keywords — each match adds `keywordWeight` to the score. */
  keywords: string[];
  keywordWeight: number;
  /** Optional extractor that pulls named params from the message. */
  extract?: (message: string) => Record<string, string>;
}

// ---------------------------------------------------------------------------
// Param extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a guest name and table identifier from messages like
 * "move Alice to table 3" or "put Bob at table VIP".
 */
function extractGuestAndTable(message: string): Record<string, string> {
  const params: Record<string, string> = {};

  // "move/put/place <name> to/at table <id>"
  const mt = message.match(
    /(?:move|put|place|assign|seat)\s+(.+?)\s+(?:to|at|on)\s+table\s+(\w+)/i,
  );
  if (mt) {
    params.guestName = mt[1].trim();
    params.tableNumber = mt[2].trim();
    return params;
  }

  // "table <id> for <name>"
  const tf = message.match(/table\s+(\w+)\s+for\s+(.+?)(?:\s*$|[.,!?])/i);
  if (tf) {
    params.tableNumber = tf[1].trim();
    params.guestName = tf[2].trim();
  }

  return params;
}

/**
 * Extracts two guest names from swap-style messages like
 * "swap Alice and Bob" or "switch Charlie with Dana".
 */
function extractSwapGuests(message: string): Record<string, string> {
  const params: Record<string, string> = {};
  const m = message.match(
    /(?:swap|switch|exchange|interchange)\s+(.+?)\s+(?:and|with|&)\s+(.+?)(?:\s*$|[.,!?])/i,
  );
  if (m) {
    params.guestA = m[1].trim();
    params.guestB = m[2].trim();
  }
  return params;
}

/**
 * Extracts a guest name from removal/unseat messages.
 */
function extractUnseatGuest(message: string): Record<string, string> {
  const params: Record<string, string> = {};
  // "unseat Alice", "remove Bob from table"
  const m = message.match(
    /(?:unseat|remove|take out|unassign)\s+(.+?)(?:\s+from\s+.+)?(?:\s*$|[.,!?])/i,
  );
  if (m) {
    params.guestName = m[1].replace(/\s+from\s+.*$/i, '').trim();
  }
  return params;
}

/**
 * Extracts a search query / guest name from search messages.
 */
function extractSearchQuery(message: string): Record<string, string> {
  const params: Record<string, string> = {};
  // "find Alice", "where is Bob", "who is Charlie", "search for Dana"
  const m = message.match(
    /(?:find|where\s+is|who\s+is|search\s+for|look\s+up|locate)\s+(.+?)(?:\s*$|[.,!?])/i,
  );
  if (m) {
    params.guestName = m[1].trim();
  }
  return params;
}

/**
 * Extracts a table number from table-info messages.
 */
function extractTableNumber(message: string): Record<string, string> {
  const params: Record<string, string> = {};
  const m = message.match(
    /(?:table|tbl)\s+(\w+)/i,
  );
  if (m) {
    params.tableNumber = m[1].trim();
  }
  return params;
}

/**
 * Extracts a guest name from add-guest messages.
 */
function extractAddGuest(message: string): Record<string, string> {
  const params: Record<string, string> = {};
  // "add Alice to guest list", "invite Bob", "add Charlie"
  const m = message.match(
    /(?:add|invite|include)\s+(.+?)(?:\s+to\s+(?:the\s+)?(?:guest\s*list|event|party))?(?:\s*$|[.,!?])/i,
  );
  if (m) {
    params.guestName = m[1]
      .replace(/\s+to\s+(?:the\s+)?(?:guest\s*list|event|party).*/i, '')
      .trim();
  }
  return params;
}

/**
 * Extracts a table identifier from remove-table messages.
 */
function extractRemoveTable(message: string): Record<string, string> {
  const params: Record<string, string> = {};
  const m = message.match(
    /(?:remove|delete|drop|get\s+rid\s+of)\s+table\s+(\w+)/i,
  );
  if (m) {
    params.tableNumber = m[1].trim();
  }
  return params;
}

// ---------------------------------------------------------------------------
// Intent rules
// ---------------------------------------------------------------------------

const INTENT_RULES: IntentRule[] = [
  // ---- seat_guests (auto-seat all) ----
  {
    intent: 'seat_guests',
    patterns: [
      /\b(?:auto[- ]?seat|seat\s+(?:all|every(?:one|body)))\b/i,
      /\b(?:place|assign)\s+(?:all\s+)?guests?\b/i,
      /\bauto(?:matic(?:ally)?)?(?:\s+seat|\s+assign|\s+place)\b/i,
      /\bseat\s+them\b/i,
      /\bseat\s+(?:my\s+)?guests?\b/i,
      /\brun\s+(?:the\s+)?seating\b/i,
      /\bdo\s+(?:the\s+)?seating\b/i,
      /\bgenerate\s+(?:the\s+)?seating\b/i,
      /\bcreate\s+(?:the\s+)?seating\b/i,
      /\bmake\s+seating\s+assignments?\b/i,
      /\bseating\s+algorithm\b/i,
      /\bfill\s+(?:the\s+)?tables?\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['auto seat', 'seat everyone', 'place guests', 'assign seats', 'seat all', 'auto assign',
      'seat guests', 'seat my guests', 'do the seating', 'run seating', 'run the seating',
      'seating algorithm', 'generate seating', 'create seating', 'fill the tables'],
    keywordWeight: 0.8,
  },

  // ---- move_guest ----
  {
    intent: 'move_guest',
    patterns: [
      /\bmove\s+.+\s+to\s+table\b/i,
      /\bput\s+.+\s+at\s+table\b/i,
      /\bplace\s+.+\s+at\s+table\b/i,
      /\bassign\s+.+\s+to\s+table\b/i,
      /\bseat\s+.+\s+at\s+table\b/i,
    ],
    patternWeight: 0.9,
    keywords: ['move to table', 'put at table', 'assign to table', 'seat at table'],
    keywordWeight: 0.75,
    extract: extractGuestAndTable,
  },

  // ---- swap_guests ----
  {
    intent: 'swap_guests',
    patterns: [
      /\bswap\s+.+\s+(?:and|with|&)\s+.+/i,
      /\bswitch\s+.+\s+(?:and|with|&)\s+.+/i,
      /\bexchange\s+.+\s+(?:and|with|&)\s+.+/i,
    ],
    patternWeight: 0.9,
    keywords: ['swap', 'switch seats', 'exchange seats', 'interchange'],
    keywordWeight: 0.7,
    extract: extractSwapGuests,
  },

  // ---- unseat_guest ----
  {
    intent: 'unseat_guest',
    patterns: [
      /\bunseat\s+.+/i,
      /\bremove\s+.+\s+from\s+(?:the\s+)?table\b/i,
      /\bunassign\s+.+/i,
      /\btake\s+.+\s+off\s+(?:the\s+)?table\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['unseat', 'remove from table', 'unassign', 'take off table'],
    keywordWeight: 0.75,
    extract: extractUnseatGuest,
  },

  // ---- event_status ----
  {
    intent: 'event_status',
    patterns: [
      /\b(?:how(?:'s| is)\s+(?:the\s+)?event)\b/i,
      /\bevent\s+(?:status|overview|summary|report)\b/i,
      /\bgive\s+me\s+(?:a\s+)?(?:status|overview|summary|report)\b/i,
      /\bwhat(?:'s| is)\s+(?:the\s+)?(?:status|overview)\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['status', 'overview', 'summary', 'event status', 'how is the event', 'event overview', 'dashboard'],
    keywordWeight: 0.6,
  },

  // ---- guest_search ----
  {
    intent: 'guest_search',
    patterns: [
      /\bfind\s+\w+/i,
      /\bwhere\s+is\s+\w+/i,
      /\bwho\s+is\s+\w+/i,
      /\bsearch\s+for\s+\w+/i,
      /\blook\s+up\s+\w+/i,
      /\blocate\s+\w+/i,
    ],
    patternWeight: 0.8,
    keywords: ['find', 'where is', 'who is', 'search for', 'look up', 'locate'],
    keywordWeight: 0.6,
    extract: extractSearchQuery,
  },

  // ---- guest_list ----
  {
    intent: 'guest_list',
    patterns: [
      /\bguest\s*list\b/i,
      /\bshow\s+(?:all\s+)?guests?\b/i,
      /\bwho(?:'s| is)\s+(?:coming|attending|invited)\b/i,
      /\blist\s+(?:all\s+)?(?:the\s+)?guests?\b/i,
      /\bhow\s+many\s+guests?\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['guest list', 'show guests', 'who is coming', 'list guests', 'attendees', 'who is invited', 'who is attending'],
    keywordWeight: 0.75,
  },

  // ---- table_info ----
  {
    intent: 'table_info',
    patterns: [
      /\bshow\s+(?:me\s+)?table\s+\w+\b/i,
      /\bwho(?:'s| is)\s+at\s+table\s+\w+\b/i,
      /\btable\s+\w+\s+(?:info|details|status)\b/i,
      /\bwhat(?:'s| is)\s+(?:on|at)\s+table\s+\w+\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['show table', 'table info', 'who is at table', 'table details', 'table status'],
    keywordWeight: 0.7,
    extract: extractTableNumber,
  },

  // ---- seating_score ----
  {
    intent: 'seating_score',
    patterns: [
      /\bscore\s+(?:the\s+)?seating\b/i,
      /\bseating\s+score\b/i,
      /\bhow\s+good\s+is\s+(?:the\s+)?seating\b/i,
      /\brate\s+(?:the\s+)?seating\b/i,
      /\bevaluate\s+(?:the\s+)?seating\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['score seating', 'seating score', 'rate seating', 'evaluate seating', 'seating quality', 'how good is seating'],
    keywordWeight: 0.75,
  },

  // ---- optimize ----
  {
    intent: 'optimize',
    patterns: [
      /\boptimize\b/i,
      /\bimprove\s+(?:the\s+)?seating\b/i,
      /\brefine\s+(?:the\s+)?seating\b/i,
      /\bmake\s+(?:the\s+)?seating\s+better\b/i,
      /\bbetter\s+seating\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['optimize', 'improve', 'refine', 'better seating', 'improve seating', 'refine seating', 'enhance'],
    keywordWeight: 0.65,
  },

  // ---- dietary_check ----
  {
    intent: 'dietary_check',
    patterns: [
      /\bdietary\s+(?:needs?|requirements?|restrictions?|info)\b/i,
      /\bfood\s+(?:allerg(?:ies|y)|restrictions?|requirements?)\b/i,
      /\ballerg(?:ies|y)\b/i,
      /\bspecial\s+(?:diet|meals?|food)\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['dietary', 'allergies', 'food allergy', 'dietary needs', 'dietary restrictions', 'special diet', 'food restrictions', 'vegetarian', 'vegan', 'gluten free', 'kosher', 'halal'],
    keywordWeight: 0.7,
  },

  // ---- issues_check ----
  {
    intent: 'issues_check',
    patterns: [
      /\bany\s+(?:issues?|problems?|concerns?|conflicts?)\b/i,
      /\bcheck\s+(?:for\s+)?(?:issues?|problems?|conflicts?)\b/i,
      /\bflag\s+(?:issues?|problems?|concerns?)\b/i,
      /\bwhat(?:'s| is)\s+wrong\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['issues', 'problems', 'concerns', 'conflicts', 'flag issues', 'any problems', 'what is wrong', 'check issues'],
    keywordWeight: 0.65,
  },

  // ---- email_draft ----
  {
    intent: 'email_draft',
    patterns: [
      /\bdraft\s+(?:an?\s+)?email\b/i,
      /\bwrite\s+(?:an?\s+)?(?:email|message|letter)\b/i,
      /\bcompose\s+(?:an?\s+)?(?:email|message)\b/i,
      /\bsend\s+(?:an?\s+)?(?:email|message)\b/i,
      /\bemail\s+(?:draft|template)\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['draft email', 'write email', 'compose email', 'email draft', 'send email', 'write message', 'email template'],
    keywordWeight: 0.75,
  },

  // ---- add_guest ----
  {
    intent: 'add_guest',
    patterns: [
      /\badd\s+.+\s+to\s+(?:the\s+)?(?:guest\s*list|event|party)\b/i,
      /\binvite\s+\w+/i,
      /\badd\s+(?:a\s+)?(?:new\s+)?guest\b/i,
      /\binclude\s+.+\s+(?:in|on)\s+(?:the\s+)?(?:guest\s*list|event)\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['add guest', 'invite', 'add to guest list', 'new guest', 'include guest'],
    keywordWeight: 0.7,
    extract: extractAddGuest,
  },

  // ---- add_table ----
  {
    intent: 'add_table',
    patterns: [
      /\badd\s+(?:a\s+)?(?:new\s+)?table\b/i,
      /\bcreate\s+(?:a\s+)?(?:new\s+)?table\b/i,
      /\bnew\s+table\b/i,
      /\bmore\s+tables?\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['add table', 'create table', 'new table', 'add a table', 'more tables'],
    keywordWeight: 0.8,
  },

  // ---- remove_table ----
  {
    intent: 'remove_table',
    patterns: [
      /\bremove\s+table\s+\w+\b/i,
      /\bdelete\s+table\s+\w+\b/i,
      /\bdrop\s+table\s+\w+\b/i,
      /\bget\s+rid\s+of\s+table\s+\w+\b/i,
    ],
    patternWeight: 0.85,
    keywords: ['remove table', 'delete table', 'drop table', 'get rid of table'],
    keywordWeight: 0.8,
    extract: extractRemoveTable,
  },

  // ---- clear_seating ----
  {
    intent: 'clear_seating',
    patterns: [
      /\bclear\s+(?:all\s+)?seating\b/i,
      /\breset\s+(?:all\s+)?seating\b/i,
      /\bremove\s+all\s+seat(?:ing)?\s+assignments?\b/i,
      /\bunseat\s+(?:all|every(?:one|body))\b/i,
      /\bstart\s+(?:seating\s+)?(?:over|fresh|from\s+scratch)\b/i,
    ],
    patternWeight: 0.9,
    keywords: ['clear seating', 'reset seating', 'start over', 'from scratch', 'unseat everyone', 'remove all seating'],
    keywordWeight: 0.8,
  },

  // ---- general_question (low-priority catch-all for conversational) ----
  {
    intent: 'general_question',
    patterns: [
      /\b(?:what|how|why|when|where|can\s+you|could\s+you|tell\s+me|explain|help)\b/i,
    ],
    patternWeight: 0.2,
    keywords: ['help', 'what can you do', 'tell me', 'explain', 'how do i'],
    keywordWeight: 0.25,
  },
];

// ---------------------------------------------------------------------------
// Scoring engine
// ---------------------------------------------------------------------------

function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreIntent(rule: IntentRule, normalized: string): number {
  let score = 0;

  // Pattern matching — take the best pattern weight if any match
  const hasPatternMatch = rule.patterns.some((p) => p.test(normalized));
  if (hasPatternMatch) {
    score = Math.max(score, rule.patternWeight);
  }

  // Keyword matching — accumulate for multiple keyword hits
  let keywordHits = 0;
  for (const kw of rule.keywords) {
    if (normalized.includes(kw.toLowerCase())) {
      keywordHits++;
    }
  }
  if (keywordHits > 0) {
    // First keyword hit gets full weight, subsequent hits add diminishing bonus
    const keywordScore =
      rule.keywordWeight + Math.min(keywordHits - 1, 3) * 0.05;
    score = Math.max(score, keywordScore);
  }

  // Boost if both patterns and keywords matched
  if (hasPatternMatch && keywordHits > 0) {
    score = Math.min(1.0, score + 0.1);
  }

  return score;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classifies a user message into a `FranckIntent` without an LLM call.
 * Uses keyword matching, regex patterns, and simple NLP heuristics.
 */
export function classifyIntent(message: string): IntentMatch {
  const normalized = normalizeMessage(message);

  if (!normalized) {
    return {
      intent: 'unknown',
      confidence: 0,
      extractedParams: {},
    };
  }

  let bestIntent: FranckIntent = 'unknown';
  let bestConfidence = 0;
  let bestExtract: Record<string, string> = {};
  let bestRule: IntentRule | null = null;

  for (const rule of INTENT_RULES) {
    const confidence = scoreIntent(rule, normalized);
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestIntent = rule.intent;
      bestRule = rule;
    }
  }

  // Run extractor for the winning rule
  if (bestRule?.extract) {
    bestExtract = bestRule.extract(normalized);
  }

  // If confidence is very low, fall back to unknown
  if (bestConfidence < 0.15) {
    bestIntent = 'unknown';
  }

  const suggestedTool = getIntentToolMapping(bestIntent);

  return {
    intent: bestIntent,
    confidence: Math.round(bestConfidence * 100) / 100,
    extractedParams: bestExtract,
    ...(suggestedTool ? { suggestedTool } : {}),
  };
}

// ---------------------------------------------------------------------------
// Intent -> Tool mapping
// ---------------------------------------------------------------------------

const INTENT_TOOL_MAP: Record<FranckIntent, string | null> = {
  seat_guests: 'auto_seat_guests',
  move_guest: 'move_guest_to_table',
  swap_guests: 'swap_guests',
  unseat_guest: 'unseat_guest',
  event_status: 'get_event_summary',
  guest_search: 'search_guests',
  guest_list: 'analyze_guest_list',
  table_info: 'get_table_info',
  seating_score: 'score_seating',
  optimize: 'run_refinement_loop',
  dietary_check: 'analyze_dietary_needs',
  issues_check: 'flag_issues',
  email_draft: 'generate_email_draft',
  add_guest: 'add_guest',
  add_table: 'add_table',
  remove_table: 'remove_table',
  clear_seating: 'clear_all_seating',
  general_question: null,
  unknown: null,
};

/**
 * Returns the primary tool name that should be called for a given intent,
 * or `null` if the intent does not map to a specific tool.
 */
export function getIntentToolMapping(intent: FranckIntent): string | null {
  return INTENT_TOOL_MAP[intent] ?? null;
}

// ---------------------------------------------------------------------------
// Build tool input from extracted params
// ---------------------------------------------------------------------------

/**
 * Builds a tool input object from the extracted parameters of an intent match.
 * Returns `null` if the intent has no associated tool or if required params
 * are missing.
 */
export function buildToolInputFromIntent(
  match: IntentMatch,
  eventId: string,
): Record<string, unknown> | null {
  const tool = getIntentToolMapping(match.intent);
  if (!tool) return null;

  const { extractedParams: p } = match;
  const base: Record<string, unknown> = { eventId };

  switch (match.intent) {
    case 'seat_guests':
      return { ...base };

    case 'move_guest':
      if (!p.guestName) return null;
      return {
        ...base,
        guestName: p.guestName,
        ...(p.tableNumber ? { tableNumber: p.tableNumber } : {}),
      };

    case 'swap_guests':
      if (!p.guestA || !p.guestB) return null;
      return {
        ...base,
        guestA: p.guestA,
        guestB: p.guestB,
      };

    case 'unseat_guest':
      if (!p.guestName) return null;
      return {
        ...base,
        guestName: p.guestName,
      };

    case 'event_status':
      return { ...base };

    case 'guest_search':
      if (!p.guestName) return null;
      return {
        ...base,
        query: p.guestName,
      };

    case 'guest_list':
      return { ...base };

    case 'table_info':
      if (!p.tableNumber) return null;
      return {
        ...base,
        tableNumber: p.tableNumber,
      };

    case 'seating_score':
      return { ...base };

    case 'optimize':
      return { ...base };

    case 'dietary_check':
      return { ...base };

    case 'issues_check':
      return { ...base };

    case 'email_draft':
      return { ...base };

    case 'add_guest':
      if (!p.guestName) return null;
      return {
        ...base,
        name: p.guestName,
      };

    case 'add_table':
      return { ...base };

    case 'remove_table':
      if (!p.tableNumber) return null;
      return {
        ...base,
        tableNumber: p.tableNumber,
      };

    case 'clear_seating':
      return { ...base };

    default:
      return null;
  }
}
