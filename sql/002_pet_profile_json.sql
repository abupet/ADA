-- 002_pet_profile_json.sql - Full pet sync (PR 6)
ALTER TABLE pets ADD COLUMN IF NOT EXISTS profile_json JSONB DEFAULT '{}';
