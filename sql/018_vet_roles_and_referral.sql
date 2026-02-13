-- 018_vet_roles_and_referral.sql
-- Migrate vet → vet_int/vet_ext, add referring_vet to pets, add referral_form to conversations

-- === 1. Migrate existing 'vet' roles to 'vet_int' ===
UPDATE users SET base_role = 'vet_int' WHERE base_role = 'vet';

-- === 2. Add referring_vet_user_id to pets ===
ALTER TABLE pets ADD COLUMN IF NOT EXISTS referring_vet_user_id TEXT;

-- === 3. Add referral_form JSONB to conversations ===
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_form JSONB;

-- === 4. Add index for referring_vet lookups ===
CREATE INDEX IF NOT EXISTS idx_pets_referring_vet ON pets(referring_vet_user_id)
    WHERE referring_vet_user_id IS NOT NULL;
