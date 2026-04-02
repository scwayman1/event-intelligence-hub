-- ============================================================
-- Add venue image / satellite capture fields to event_versions
-- ============================================================
-- These columns store the satellite image data and scale info
-- so that venue maps persist across devices and sessions.
-- ============================================================

ALTER TABLE public.event_versions
  ADD COLUMN IF NOT EXISTS venue_image_data    text,
  ADD COLUMN IF NOT EXISTS venue_image_opacity double precision NOT NULL DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS meters_per_pixel    double precision,
  ADD COLUMN IF NOT EXISTS canvas_width        integer,
  ADD COLUMN IF NOT EXISTS canvas_height       integer;

COMMENT ON COLUMN public.event_versions.venue_image_data    IS 'Base64 JPEG data URL of the venue satellite/floor plan image';
COMMENT ON COLUMN public.event_versions.venue_image_opacity IS 'Opacity for the venue image overlay (0-1)';
COMMENT ON COLUMN public.event_versions.meters_per_pixel    IS 'Real-world meters per canvas pixel for scale';
COMMENT ON COLUMN public.event_versions.canvas_width        IS 'Canvas width in pixels';
COMMENT ON COLUMN public.event_versions.canvas_height       IS 'Canvas height in pixels';
