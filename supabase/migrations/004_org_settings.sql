-- ============================================================
-- Add org-level settings (LLM config, etc.)
-- ============================================================
-- Stores org-wide configuration as JSONB so all team members
-- share the same LLM provider/key without each needing their own.
-- Example: { "llm_config": { "provider": "openrouter", "model": "...", "api_key_encrypted": "..." } }
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

-- Allow org members to read settings (needed to fetch LLM config)
-- The existing UPDATE policy already covers writes for org members.
COMMENT ON COLUMN public.organizations.settings IS 'Org-wide settings JSON. Keys: llm_config (provider, model, api_key).';
