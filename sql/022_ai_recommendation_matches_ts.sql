-- 022: Add timestamp for AI recommendation matches
-- Tracks when ai_recommendation_matches was last generated/updated
-- Used by bulk analysis Phase 2 to decide if analysis needs re-running

ALTER TABLE pets ADD COLUMN IF NOT EXISTS ai_recommendation_matches_generated_at TIMESTAMPTZ;
