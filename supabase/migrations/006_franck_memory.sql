-- ============================================================
-- Franck memory system with pgvector support
-- ============================================================
-- Stores memories (instructions, decisions, preferences, etc.)
-- produced during Franck AI assistant conversations. Supports
-- both vector similarity search and full-text search fallback.
-- ============================================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- franck_memories table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.franck_memories (
  id          text PRIMARY KEY DEFAULT ('fm-' || substr(gen_random_uuid()::text, 1, 8)),
  event_id    text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  org_id      text NOT NULL,

  -- Memory content
  type        text NOT NULL CHECK (type IN ('instruction', 'decision', 'preference', 'context', 'observation')),
  content     text NOT NULL,
  summary     text,  -- Short one-liner for context injection

  -- Metadata
  importance  smallint NOT NULL DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  source      text NOT NULL DEFAULT 'conversation' CHECK (source IN ('conversation', 'tool_result', 'user_explicit', 'system')),
  tool_name   text,  -- Which tool produced this memory (if any)

  -- Vector embedding for semantic search
  embedding   vector(384),  -- Dimension for lightweight embedding model

  -- Timestamps
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,  -- Optional TTL for temporary memories

  -- Full-text search (fallback when no embeddings)
  search_text tsvector GENERATED ALWAYS AS (to_tsvector('english', content || ' ' || coalesce(summary, ''))) STORED
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_franck_memories_event      ON public.franck_memories(event_id);
CREATE INDEX IF NOT EXISTS idx_franck_memories_type        ON public.franck_memories(event_id, type);
CREATE INDEX IF NOT EXISTS idx_franck_memories_importance  ON public.franck_memories(event_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_franck_memories_search      ON public.franck_memories USING gin(search_text);
CREATE INDEX IF NOT EXISTS idx_franck_memories_embedding   ON public.franck_memories USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- ------------------------------------------------------------
-- Vector similarity search
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION match_memories(
  p_event_id   text,
  p_embedding  vector(384),
  p_match_count int DEFAULT 10,
  p_threshold   float DEFAULT 0.5
)
RETURNS TABLE(
  id          text,
  type        text,
  content     text,
  summary     text,
  importance  smallint,
  similarity  float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    fm.id,
    fm.type,
    fm.content,
    fm.summary,
    fm.importance,
    1 - (fm.embedding <=> p_embedding) AS similarity
  FROM public.franck_memories fm
  WHERE fm.event_id = p_event_id
    AND fm.embedding IS NOT NULL
    AND (fm.expires_at IS NULL OR fm.expires_at > now())
    AND 1 - (fm.embedding <=> p_embedding) > p_threshold
  ORDER BY fm.embedding <=> p_embedding
  LIMIT p_match_count;
$$;

-- ------------------------------------------------------------
-- Full-text search fallback (when no embeddings available)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_memories_text(
  p_event_id    text,
  p_query       text,
  p_match_count int DEFAULT 10
)
RETURNS TABLE(
  id          text,
  type        text,
  content     text,
  summary     text,
  importance  smallint,
  rank        float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    fm.id,
    fm.type,
    fm.content,
    fm.summary,
    fm.importance,
    ts_rank(fm.search_text, websearch_to_tsquery('english', p_query)) AS rank
  FROM public.franck_memories fm
  WHERE fm.event_id = p_event_id
    AND (fm.expires_at IS NULL OR fm.expires_at > now())
    AND fm.search_text @@ websearch_to_tsquery('english', p_query)
  ORDER BY fm.importance DESC, rank DESC
  LIMIT p_match_count;
$$;

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
ALTER TABLE public.franck_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read memories for their org events"
  ON public.franck_memories FOR SELECT
  USING (true);

CREATE POLICY "Users can insert memories"
  ON public.franck_memories FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their memories"
  ON public.franck_memories FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their memories"
  ON public.franck_memories FOR DELETE
  USING (true);
