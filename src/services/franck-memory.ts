/**
 * Franck Eggelhoffer AI Agent — Memory Service
 *
 * Manages per-event contextual memory stored in the `franck_memories`
 * Supabase table. Supports full-text search via an RPC function with
 * client-side fallback. Memory failures are handled gracefully and
 * never break the agent.
 */

import { supabase } from '@/integrations/supabase/client';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type MemoryType = 'instruction' | 'decision' | 'preference' | 'context' | 'observation';
export type MemorySource = 'conversation' | 'tool_result' | 'user_explicit' | 'system';

export interface FranckMemory {
  id: string;
  eventId: string;
  orgId: string;
  type: MemoryType;
  content: string;
  summary: string | null;
  importance: number; // 1-10
  source: MemorySource;
  toolName: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface MemorySearchResult extends FranckMemory {
  relevanceScore: number;
}

export interface FranckMemoryCandidate {
  type: MemoryType;
  content: string;
  summary: string | null;
  importance: number;
  source: MemorySource;
  toolName: string | null;
}

// ──────────────────────────────────────────────
// Row Mapping
// ──────────────────────────────────────────────

function rowToMemory(row: any): FranckMemory {
  return {
    id: row.id,
    eventId: row.event_id,
    orgId: row.org_id,
    type: row.type,
    content: row.content,
    summary: row.summary,
    importance: row.importance,
    source: row.source,
    toolName: row.tool_name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function memoryToRow(memory: Partial<FranckMemory> & { eventId: string; orgId: string }) {
  const row: Record<string, unknown> = {};
  if (memory.eventId) row.event_id = memory.eventId;
  if (memory.orgId) row.org_id = memory.orgId;
  if (memory.type) row.type = memory.type;
  if (memory.content !== undefined) row.content = memory.content;
  if (memory.summary !== undefined) row.summary = memory.summary;
  if (memory.importance !== undefined) row.importance = memory.importance;
  if (memory.source) row.source = memory.source;
  if (memory.toolName !== undefined) row.tool_name = memory.toolName;
  if (memory.expiresAt !== undefined) row.expires_at = memory.expiresAt;
  return row;
}

// ──────────────────────────────────────────────
// storeMemory
// ──────────────────────────────────────────────

export async function storeMemory(
  memory: Omit<FranckMemory, 'id' | 'createdAt'>,
): Promise<FranckMemory | null> {
  try {
    const row = memoryToRow(memory as Partial<FranckMemory> & { eventId: string; orgId: string });
    const { data, error } = await supabase
      .from('franck_memories')
      .upsert(row as any)
      .select()
      .single();
    if (error) {
      console.error('storeMemory:', error.message);
      return null;
    }
    return rowToMemory(data);
  } catch (err) {
    console.error('storeMemory unexpected error:', err);
    return null;
  }
}

// ──────────────────────────────────────────────
// getEventMemories
// ──────────────────────────────────────────────

export async function getEventMemories(
  eventId: string,
  opts?: { type?: MemoryType; limit?: number; minImportance?: number },
): Promise<FranckMemory[]> {
  try {
    let query = supabase
      .from('franck_memories')
      .select('*')
      .eq('event_id', eventId)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false });

    if (opts?.type) {
      query = query.eq('type', opts.type);
    }
    if (opts?.minImportance !== undefined) {
      query = query.gte('importance', opts.minImportance);
    }
    if (opts?.limit !== undefined) {
      query = query.limit(opts.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.error('getEventMemories:', error.message);
      return [];
    }
    return (data ?? []).map(rowToMemory);
  } catch (err) {
    console.error('getEventMemories unexpected error:', err);
    return [];
  }
}

// ──────────────────────────────────────────────
// searchMemories
// ──────────────────────────────────────────────

export async function searchMemories(
  eventId: string,
  query: string,
  limit: number = 10,
): Promise<MemorySearchResult[]> {
  try {
    // Attempt full-text search via RPC
    const { data, error } = await supabase.rpc('search_memories_text', {
      p_event_id: eventId,
      p_query: query,
      p_limit: limit,
    });

    if (!error && data) {
      return (data as any[]).map((row: any) => ({
        ...rowToMemory(row),
        relevanceScore: row.relevance_score ?? row.rank ?? 1,
      }));
    }

    // Fallback: client-side filtering
    console.warn('searchMemories: RPC unavailable, falling back to client-side filter');
    return await searchMemoriesClientFallback(eventId, query, limit);
  } catch (err) {
    console.error('searchMemories unexpected error:', err);
    return await searchMemoriesClientFallback(eventId, query, limit);
  }
}

async function searchMemoriesClientFallback(
  eventId: string,
  query: string,
  limit: number,
): Promise<MemorySearchResult[]> {
  try {
    const all = await getEventMemories(eventId);
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/).filter(Boolean);

    const scored = all
      .map((m) => {
        const text = `${m.content} ${m.summary ?? ''}`.toLowerCase();
        let matchCount = 0;
        for (const term of terms) {
          if (text.includes(term)) matchCount++;
        }
        const relevanceScore = terms.length > 0 ? matchCount / terms.length : 0;
        return { ...m, relevanceScore };
      })
      .filter((m) => m.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);

    return scored;
  } catch (err) {
    console.error('searchMemoriesClientFallback unexpected error:', err);
    return [];
  }
}

// ──────────────────────────────────────────────
// deleteMemory
// ──────────────────────────────────────────────

export async function deleteMemory(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('franck_memories')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('deleteMemory:', error.message);
    }
  } catch (err) {
    console.error('deleteMemory unexpected error:', err);
  }
}

// ──────────────────────────────────────────────
// clearEventMemories
// ──────────────────────────────────────────────

export async function clearEventMemories(eventId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('franck_memories')
      .delete()
      .eq('event_id', eventId);
    if (error) {
      console.error('clearEventMemories:', error.message);
    }
  } catch (err) {
    console.error('clearEventMemories unexpected error:', err);
  }
}

// ──────────────────────────────────────────────
// buildMemoryContext
// ──────────────────────────────────────────────

export async function buildMemoryContext(
  eventId: string,
  userMessage: string,
): Promise<string> {
  try {
    // Fetch in parallel: instructions/preferences, recent decisions, search results
    const [instructions, preferences, decisions, searchResults] = await Promise.all([
      getEventMemories(eventId, { type: 'instruction', minImportance: 7 }),
      getEventMemories(eventId, { type: 'preference', minImportance: 7 }),
      getEventMemories(eventId, { type: 'decision', limit: 10 }),
      searchMemories(eventId, userMessage, 5),
    ]);

    const hasAny =
      instructions.length > 0 ||
      preferences.length > 0 ||
      decisions.length > 0 ||
      searchResults.length > 0;

    if (!hasAny) return '';

    const sections: string[] = [];
    sections.push('═══ EVENT MEMORY ═══');
    sections.push('');

    if (instructions.length > 0) {
      sections.push('STANDING INSTRUCTIONS:');
      for (const m of instructions) {
        sections.push(`• ${truncate(m.content, 200)}`);
      }
      sections.push('');
    }

    if (preferences.length > 0) {
      sections.push('PREFERENCES:');
      for (const m of preferences) {
        sections.push(`• ${truncate(m.content, 200)}`);
      }
      sections.push('');
    }

    if (decisions.length > 0) {
      sections.push('RECENT DECISIONS:');
      for (const m of decisions) {
        const ts = formatTimestamp(m.createdAt);
        sections.push(`• [${ts}] ${truncate(m.content, 200)}`);
      }
      sections.push('');
    }

    if (searchResults.length > 0) {
      sections.push('RELEVANT CONTEXT:');
      for (const m of searchResults) {
        sections.push(`• ${truncate(m.content, 200)}`);
      }
      sections.push('');
    }

    // Cap total memory context to prevent system prompt overflow
    const MAX_MEMORY_CHARS = 2000;
    let result = sections.join('\n');
    if (result.length > MAX_MEMORY_CHARS) {
      result = result.slice(0, MAX_MEMORY_CHARS) + '\n\n[Memory context truncated]';
    }
    return result;
  } catch (err) {
    console.error('buildMemoryContext unexpected error:', err);
    return '';
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ──────────────────────────────────────────────
// extractMemories
// ──────────────────────────────────────────────

/** Tool names whose invocations represent state-changing decisions. */
const DECISION_TOOLS = new Set([
  'move_guest',
  'auto_seat',
  'arrange_tables',
  'swap_guests',
  'unseat_guest',
  'add_guest',
  'remove_guest',
  'update_guest',
  'add_seating_rule',
  'remove_seating_rule',
  'add_table',
  'remove_table',
]);

const INSTRUCTION_PATTERNS: RegExp[] = [
  /\balways\b/i,
  /\bnever\b/i,
  /\bfrom now on\b/i,
  /\bgoing forward\b/i,
  /\bmake sure to\b/i,
  /\bdon['']?t ever\b/i,
  /\bevery time\b/i,
  /\bremember to\b/i,
];

const PREFERENCE_PATTERNS: RegExp[] = [
  /\bi (?:would )?prefer\b/i,
  /\bi want\b/i,
  /\bi['']?d like\b/i,
  /\blet['']?s keep\b/i,
  /\blet['']?s use\b/i,
  /\blet['']?s go with\b/i,
  /\bi like\b/i,
];

const CONTEXT_PATTERNS: RegExp[] = [
  /\bthis is a\b/i,
  /\bthis event is\b/i,
  /\bwe['']?re (?:expecting|planning|hosting)\b/i,
  /\b\d{2,4}\s*guests?\b/i,
  /\bthe (?:venue|theme|budget) is\b/i,
  /\bscholarship\b/i,
  /\bceremony\b/i,
  /\bgala\b/i,
  /\bcommencement\b/i,
];

export function extractMemories(
  userMessage: string,
  assistantResponse: string,
  toolCalls: { name: string; result: string }[],
): FranckMemoryCandidate[] {
  const candidates: FranckMemoryCandidate[] = [];

  // Skip very short messages — they're unlikely to contain meaningful instructions
  if (userMessage.length < 15) return candidates;

  // Check user message for instructions
  if (INSTRUCTION_PATTERNS.some((p) => p.test(userMessage))) {
    candidates.push({
      type: 'instruction',
      content: userMessage,
      summary: null,
      importance: 9,
      source: 'user_explicit',
      toolName: null,
    });
  }

  // Check user message for preferences (only if not already captured as instruction)
  if (
    candidates.length === 0 &&
    PREFERENCE_PATTERNS.some((p) => p.test(userMessage))
  ) {
    candidates.push({
      type: 'preference',
      content: userMessage,
      summary: null,
      importance: 8,
      source: 'user_explicit',
      toolName: null,
    });
  }

  // Check user message for event context
  if (CONTEXT_PATTERNS.some((p) => p.test(userMessage))) {
    // Avoid duplicate if already captured as instruction or preference
    const alreadyCaptured = candidates.some(
      (c) => c.type === 'instruction' || c.type === 'preference',
    );
    if (!alreadyCaptured) {
      candidates.push({
        type: 'context',
        content: userMessage,
        summary: null,
        importance: 7,
        source: 'user_explicit',
        toolName: null,
      });
    }
  }

  // Check tool calls for decisions
  for (const tc of toolCalls) {
    if (DECISION_TOOLS.has(tc.name)) {
      candidates.push({
        type: 'decision',
        content: `Used ${tc.name}: ${truncate(tc.result, 200)}`,
        summary: null,
        importance: 6,
        source: 'tool_result',
        toolName: tc.name,
      });
    } else if (tc.result && tc.result.length > 50) {
      // Notable tool result → observation
      candidates.push({
        type: 'observation',
        content: `${tc.name} returned: ${truncate(tc.result, 200)}`,
        summary: null,
        importance: 4,
        source: 'tool_result',
        toolName: tc.name,
      });
    }
  }

  // Deduplicate candidates with very similar content
  const deduped: FranckMemoryCandidate[] = [];
  for (const candidate of candidates) {
    const isDuplicate = deduped.some(
      (existing) =>
        existing.type === candidate.type &&
        existing.content.toLowerCase() === candidate.content.toLowerCase(),
    );
    if (!isDuplicate) {
      deduped.push(candidate);
    }
  }

  return deduped;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
