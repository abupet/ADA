-- 021: Add ai_recommendation_matches column to pets table
-- Stores the top 5 AI recommendation matches (from _runAnalysisForPet)
-- Updated only when the AI description changes during bulk analysis

ALTER TABLE pets ADD COLUMN IF NOT EXISTS ai_recommendation_matches JSONB;
