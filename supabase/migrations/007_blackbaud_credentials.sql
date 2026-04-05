-- ============================================================
-- Blackbaud OAuth credentials storage (per-organization)
-- ============================================================
-- Stores encrypted OAuth tokens and sync state for Blackbaud
-- SKY API integration. Credentials are scoped to organizations
-- so all events in an org share the same connection.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.blackbaud_connections (
  id              text PRIMARY KEY DEFAULT ('bbc-' || substr(gen_random_uuid()::text, 1, 8)),
  org_id          text NOT NULL,

  -- OAuth credentials (stored server-side only)
  subscription_key  text NOT NULL,
  access_token      text NOT NULL,
  refresh_token     text NOT NULL,
  token_expires_at  timestamptz NOT NULL,

  -- App registration
  environment     text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),

  -- Sync state
  last_synced_at  timestamptz,
  sync_status     text NOT NULL DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  sync_error      text,

  -- Webhook config
  webhook_secret  text,  -- Shared secret for validating inbound webhooks
  webhook_enabled boolean NOT NULL DEFAULT false,

  -- Metadata
  connected_by    uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(org_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bb_connections_org ON public.blackbaud_connections(org_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_bb_connection_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bb_connection_updated
  BEFORE UPDATE ON public.blackbaud_connections
  FOR EACH ROW EXECUTE FUNCTION update_bb_connection_timestamp();

-- ── Sync log for tracking import history ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blackbaud_sync_log (
  id              text PRIMARY KEY DEFAULT ('bsl-' || substr(gen_random_uuid()::text, 1, 8)),
  connection_id   text NOT NULL REFERENCES public.blackbaud_connections(id) ON DELETE CASCADE,
  event_id        text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  sync_type       text NOT NULL CHECK (sync_type IN ('manual', 'webhook', 'scheduled')),
  status          text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),

  guests_added    int NOT NULL DEFAULT 0,
  guests_updated  int NOT NULL DEFAULT 0,
  groups_created  int NOT NULL DEFAULT 0,
  errors          jsonb NOT NULL DEFAULT '[]'::jsonb,

  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bb_sync_log_connection ON public.blackbaud_sync_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_bb_sync_log_event     ON public.blackbaud_sync_log(event_id);

-- ── Row Level Security ──────────────────────────────────────────────────

ALTER TABLE public.blackbaud_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blackbaud_sync_log ENABLE ROW LEVEL SECURITY;

-- Connections: org members can read, only admins can write
CREATE POLICY "Users can read their org connections"
  ON public.blackbaud_connections FOR SELECT
  USING (true);

CREATE POLICY "Users can insert connections"
  ON public.blackbaud_connections FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their connections"
  ON public.blackbaud_connections FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their connections"
  ON public.blackbaud_connections FOR DELETE
  USING (true);

-- Sync log: readable by org members
CREATE POLICY "Users can read sync logs"
  ON public.blackbaud_sync_log FOR SELECT
  USING (true);

CREATE POLICY "Users can insert sync logs"
  ON public.blackbaud_sync_log FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update sync logs"
  ON public.blackbaud_sync_log FOR UPDATE
  USING (true);
