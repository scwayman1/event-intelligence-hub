-- ============================================================
-- Event Intelligence Hub — Clean Schema (text IDs)
-- ============================================================
-- This schema uses TEXT primary keys to match the app's ID format
-- (e.g. 'org-a1b2c3d4', 'evt-f9e8d7c6', 'guest-12345678').
-- The original schema used UUID which caused silent write failures.
-- ============================================================

-- 1. profiles (extends auth.users — keeps uuid since auth.users uses uuid)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  first_name  text NOT NULL DEFAULT '',
  last_name   text NOT NULL DEFAULT '',
  email       text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'coordinator',
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  short_name    text NOT NULL,
  logo_url      text,
  primary_color text,
  created_by    uuid REFERENCES public.profiles ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. org_members
CREATE TABLE IF NOT EXISTS public.org_members (
  id        text PRIMARY KEY,
  org_id    text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

-- 4. events
CREATE TABLE IF NOT EXISTS public.events (
  id                   text PRIMARY KEY,
  org_id               text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  name                 text NOT NULL,
  type                 text NOT NULL,
  status               text NOT NULL DEFAULT 'planning',
  date                 text NOT NULL DEFAULT '',
  time                 text NOT NULL DEFAULT '',
  venue                text NOT NULL DEFAULT '',
  venue_address        text NOT NULL DEFAULT '',
  estimated_attendance integer NOT NULL DEFAULT 0,
  notes                text NOT NULL DEFAULT '',
  active_version_id    text NOT NULL DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 5. event_versions
CREATE TABLE IF NOT EXISTS public.event_versions (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES public.events ON DELETE CASCADE,
  name       text NOT NULL,
  status     text NOT NULL DEFAULT 'draft',
  created_by text NOT NULL DEFAULT '',
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. guests
CREATE TABLE IF NOT EXISTS public.guests (
  id                    text PRIMARY KEY,
  org_id                text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  event_id              text NOT NULL REFERENCES public.events ON DELETE CASCADE,
  first_name            text NOT NULL DEFAULT '',
  last_name             text NOT NULL DEFAULT '',
  display_name          text NOT NULL DEFAULT '',
  email                 text NOT NULL DEFAULT '',
  phone                 text NOT NULL DEFAULT '',
  organization          text NOT NULL DEFAULT '',
  category              text NOT NULL DEFAULT 'other',
  rsvp_status           text NOT NULL DEFAULT 'invited',
  party_size            integer NOT NULL DEFAULT 1,
  dietary_restrictions  text NOT NULL DEFAULT '',
  accessibility_needs   text NOT NULL DEFAULT '',
  notes                 text NOT NULL DEFAULT '',
  relationship_tags     text[] NOT NULL DEFAULT '{}',
  table_preference      text NOT NULL DEFAULT '',
  seating_preference    text NOT NULL DEFAULT '',
  plus_one_id           text,
  household_id          text
);

-- 7. layout_objects
CREATE TABLE IF NOT EXISTS public.layout_objects (
  id           text PRIMARY KEY,
  version_id   text NOT NULL REFERENCES public.event_versions ON DELETE CASCADE,
  type         text NOT NULL,
  name         text NOT NULL DEFAULT '',
  x            double precision NOT NULL DEFAULT 0,
  y            double precision NOT NULL DEFAULT 0,
  width        double precision NOT NULL DEFAULT 0,
  height       double precision NOT NULL DEFAULT 0,
  rotation     double precision NOT NULL DEFAULT 0,
  capacity     integer NOT NULL DEFAULT 0,
  notes        text NOT NULL DEFAULT '',
  category     text NOT NULL DEFAULT '',
  parent_id    text,
  locked       boolean NOT NULL DEFAULT false,
  visible      boolean NOT NULL DEFAULT true,
  z_index      integer NOT NULL DEFAULT 0,
  table_number integer
);

-- 8. seating_assignments
CREATE TABLE IF NOT EXISTS public.seating_assignments (
  id          text PRIMARY KEY,
  version_id  text NOT NULL REFERENCES public.event_versions ON DELETE CASCADE,
  guest_id    text NOT NULL REFERENCES public.guests ON DELETE CASCADE,
  table_id    text NOT NULL REFERENCES public.layout_objects ON DELETE CASCADE,
  seat_number integer
);

-- 9. seating_rules
CREATE TABLE IF NOT EXISTS public.seating_rules (
  id                    text PRIMARY KEY,
  event_id              text NOT NULL REFERENCES public.events ON DELETE CASCADE,
  name                  text NOT NULL DEFAULT '',
  description           text NOT NULL DEFAULT '',
  enabled               boolean NOT NULL DEFAULT true,
  priority              integer NOT NULL DEFAULT 1,
  rule_type             text,
  tag                   text,
  tag_a                 text,
  tag_b                 text,
  relationship_group_id text,
  intent                text
);

-- 10. relationship_groups
CREATE TABLE IF NOT EXISTS public.relationship_groups (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES public.events ON DELETE CASCADE,
  org_id     text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  name       text NOT NULL,
  type       text NOT NULL,
  color      text,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 11. relationship_memberships
CREATE TABLE IF NOT EXISTS public.relationship_memberships (
  id       text PRIMARY KEY,
  group_id text NOT NULL REFERENCES public.relationship_groups ON DELETE CASCADE,
  guest_id text NOT NULL REFERENCES public.guests ON DELETE CASCADE,
  role     text NOT NULL DEFAULT 'Member'
);

-- 12. collaborators
CREATE TABLE IF NOT EXISTS public.collaborators (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES public.events ON DELETE CASCADE,
  email      text NOT NULL,
  name       text NOT NULL DEFAULT '',
  role       text NOT NULL DEFAULT 'viewer',
  invited_by uuid REFERENCES public.profiles ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  status     text NOT NULL DEFAULT 'pending'
);

-- 13. team_invites
CREATE TABLE IF NOT EXISTS public.team_invites (
  id          text PRIMARY KEY,
  org_id      text NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE,
  role        text NOT NULL DEFAULT 'member',
  created_by  uuid REFERENCES public.profiles ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz,
  max_uses    integer NOT NULL DEFAULT 0,
  use_count   integer NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'active'
);

-- ============================================================
-- Trigger: auto-create profile on sign-up
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_versions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.layout_objects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seating_assignments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seating_rules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relationship_memberships  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborators             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites              ENABLE ROW LEVEL SECURITY;

-- ── Helper: check if the current user is a member of a given org ──
CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── profiles ──
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── organizations ──
CREATE POLICY "Org members can read their orgs"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id));

CREATE POLICY "Authenticated users can create orgs"
  ON public.organizations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Org members can update their orgs"
  ON public.organizations FOR UPDATE
  USING (public.is_org_member(id));

-- ── org_members ──
CREATE POLICY "Users can read own memberships"
  ON public.org_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can add themselves to orgs"
  ON public.org_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Org members can delete memberships"
  ON public.org_members FOR DELETE
  USING (public.is_org_member(org_id));

-- ── events ──
CREATE POLICY "Org members can read events"
  ON public.events FOR SELECT
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can insert events"
  ON public.events FOR INSERT
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Org members can update events"
  ON public.events FOR UPDATE
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can delete events"
  ON public.events FOR DELETE
  USING (public.is_org_member(org_id));

-- ── event_versions ──
CREATE POLICY "Org members can read versions"
  ON public.event_versions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can insert versions"
  ON public.event_versions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can update versions"
  ON public.event_versions FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can delete versions"
  ON public.event_versions FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

-- ── guests ──
CREATE POLICY "Org members can read guests"
  ON public.guests FOR SELECT
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can insert guests"
  ON public.guests FOR INSERT
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Org members can update guests"
  ON public.guests FOR UPDATE
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can delete guests"
  ON public.guests FOR DELETE
  USING (public.is_org_member(org_id));

-- ── layout_objects ──
CREATE POLICY "Org members can read layout objects"
  ON public.layout_objects FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can insert layout objects"
  ON public.layout_objects FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can update layout objects"
  ON public.layout_objects FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can delete layout objects"
  ON public.layout_objects FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

-- ── seating_assignments ──
CREATE POLICY "Org members can read seating assignments"
  ON public.seating_assignments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can insert seating assignments"
  ON public.seating_assignments FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can update seating assignments"
  ON public.seating_assignments FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can delete seating assignments"
  ON public.seating_assignments FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.event_versions v
    JOIN public.events e ON e.id = v.event_id
    WHERE v.id = version_id AND public.is_org_member(e.org_id)
  ));

-- ── seating_rules ──
CREATE POLICY "Org members can read seating rules"
  ON public.seating_rules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can insert seating rules"
  ON public.seating_rules FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can update seating rules"
  ON public.seating_rules FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can delete seating rules"
  ON public.seating_rules FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

-- ── relationship_groups ──
CREATE POLICY "Org members can read relationship groups"
  ON public.relationship_groups FOR SELECT
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can insert relationship groups"
  ON public.relationship_groups FOR INSERT
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Org members can update relationship groups"
  ON public.relationship_groups FOR UPDATE
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can delete relationship groups"
  ON public.relationship_groups FOR DELETE
  USING (public.is_org_member(org_id));

-- ── relationship_memberships ──
CREATE POLICY "Org members can read relationship memberships"
  ON public.relationship_memberships FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.relationship_groups g
    WHERE g.id = group_id AND public.is_org_member(g.org_id)
  ));

CREATE POLICY "Org members can insert relationship memberships"
  ON public.relationship_memberships FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.relationship_groups g
    WHERE g.id = group_id AND public.is_org_member(g.org_id)
  ));

CREATE POLICY "Org members can update relationship memberships"
  ON public.relationship_memberships FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.relationship_groups g
    WHERE g.id = group_id AND public.is_org_member(g.org_id)
  ));

CREATE POLICY "Org members can delete relationship memberships"
  ON public.relationship_memberships FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.relationship_groups g
    WHERE g.id = group_id AND public.is_org_member(g.org_id)
  ));

-- ── collaborators ──
CREATE POLICY "Org members can read collaborators"
  ON public.collaborators FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can insert collaborators"
  ON public.collaborators FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can update collaborators"
  ON public.collaborators FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

CREATE POLICY "Org members can delete collaborators"
  ON public.collaborators FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = event_id AND public.is_org_member(e.org_id)
  ));

-- ── team_invites ──
CREATE POLICY "Org members can read team invites"
  ON public.team_invites FOR SELECT
  USING (public.is_org_member(org_id));

CREATE POLICY "Org members can insert team invites"
  ON public.team_invites FOR INSERT
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Org members can update team invites"
  ON public.team_invites FOR UPDATE
  USING (public.is_org_member(org_id));

CREATE POLICY "Anyone can read invite by code"
  ON public.team_invites FOR SELECT
  USING (true);
