-- sql/006_pets_extra_data.sql
-- Add extra_data JSONB column for rich pet data (vitals, medications, lifestyle, history).
-- Safe to run multiple times (IF NOT EXISTS pattern via DO block).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pets' AND column_name = 'extra_data'
  ) THEN
    ALTER TABLE pets ADD COLUMN extra_data JSONB DEFAULT NULL;
  END IF;
END
$$;
