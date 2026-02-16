-- sql/020_ai_pet_description.sql
-- AI pet description cache for AI matching + voice message transcription

ALTER TABLE pets ADD COLUMN IF NOT EXISTS ai_description TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS ai_description_sources_hash TEXT;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS ai_description_generated_at TIMESTAMPTZ;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_pets_ai_desc ON pets(pet_id) WHERE ai_description IS NOT NULL;

-- Voice message transcription column
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS transcription TEXT;
