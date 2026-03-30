-- ============================================================
-- Fix RLS policies that prevent data persistence
-- ============================================================
-- The org_members SELECT policy used is_org_member() which creates
-- a chicken-and-egg problem: you can't read your own membership
-- because the function checks if you're already a member.
-- Fix: let users read their own memberships directly.
-- ============================================================

-- Fix org_members SELECT: users should always be able to read their own memberships
DROP POLICY IF EXISTS "Org members can read memberships" ON public.org_members;
DROP POLICY IF EXISTS "Users can read own memberships" ON public.org_members;
CREATE POLICY "Users can read own memberships"
  ON public.org_members FOR SELECT
  USING (user_id = auth.uid());

-- Add missing profiles INSERT policy (app may need to upsert profiles)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
