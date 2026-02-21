-- sql/026_breeder_role.sql
-- B2B Phase 1: Breeder role, litters, breeding programs, vaccinations, health passports

-- === 1. Tabella cucciolate (litters) ===
CREATE TABLE IF NOT EXISTS litters (
    litter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    breeder_user_id TEXT NOT NULL,
    mother_pet_id UUID REFERENCES pets(pet_id) ON DELETE SET NULL,
    father_pet_id UUID REFERENCES pets(pet_id) ON DELETE SET NULL,
    species TEXT NOT NULL DEFAULT 'dog',
    breed TEXT,
    mating_date DATE,
    expected_birth_date DATE,
    actual_birth_date DATE,
    expected_puppies INTEGER,
    actual_puppies INTEGER,
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'pregnant', 'born', 'weaning', 'available', 'sold_out', 'archived')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_litters_breeder ON litters(breeder_user_id, status);
CREATE INDEX IF NOT EXISTS idx_litters_mother ON litters(mother_pet_id);

-- === 2. Campi cucciolo su pets ===
ALTER TABLE pets ADD COLUMN IF NOT EXISTS litter_id UUID REFERENCES litters(litter_id) ON DELETE SET NULL;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS puppy_status TEXT DEFAULT NULL
    CHECK (puppy_status IN (NULL, 'available', 'reserved', 'sold', 'retained'));
ALTER TABLE pets ADD COLUMN IF NOT EXISTS sold_to_owner_id TEXT DEFAULT NULL;
ALTER TABLE pets ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_pets_litter ON pets(litter_id) WHERE litter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pets_puppy_status ON pets(puppy_status) WHERE puppy_status IS NOT NULL;

-- === 3. Programmi sanitari di allevamento ===
CREATE TABLE IF NOT EXISTS breeding_programs (
    program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    species TEXT NOT NULL DEFAULT 'dog',
    breed TEXT,
    target_age_min_months INTEGER,
    target_age_max_months INTEGER,
    exams JSONB NOT NULL DEFAULT '[]',
    price_package NUMERIC(10,2),
    currency TEXT DEFAULT 'EUR',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'draft', 'archived')),
    created_by TEXT,
    tenant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_breeding_programs_species ON breeding_programs(species, breed, status);

-- === 4. Iscrizioni programmi per singolo pet ===
CREATE TABLE IF NOT EXISTS breeding_program_enrollments (
    enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL REFERENCES breeding_programs(program_id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    breeder_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'enrolled'
        CHECK (status IN ('enrolled', 'in_progress', 'completed', 'expired', 'cancelled')),
    progress JSONB NOT NULL DEFAULT '{}',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enrollments_pet ON breeding_program_enrollments(pet_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_breeder ON breeding_program_enrollments(breeder_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_unique ON breeding_program_enrollments(program_id, pet_id)
    WHERE status IN ('enrolled', 'in_progress');

-- === 5. Protocolli vaccinali ===
CREATE TABLE IF NOT EXISTS vaccination_protocols (
    protocol_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    species TEXT NOT NULL DEFAULT 'dog',
    breed TEXT,
    vaccinations JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vax_protocols_species ON vaccination_protocols(species, status);

-- === 6. Vaccinazioni effettuate ===
CREATE TABLE IF NOT EXISTS pet_vaccinations (
    vaccination_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    protocol_id UUID REFERENCES vaccination_protocols(protocol_id),
    vaccine_name TEXT NOT NULL,
    administered_date DATE NOT NULL,
    next_due_date DATE,
    batch_number TEXT,
    administered_by TEXT,
    document_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pet_vax_pet ON pet_vaccinations(pet_id, administered_date DESC);
CREATE INDEX IF NOT EXISTS idx_pet_vax_due ON pet_vaccinations(next_due_date)
    WHERE next_due_date IS NOT NULL;

-- === 7. Passaporto sanitario digitale ===
CREATE TABLE IF NOT EXISTS health_passports (
    passport_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    breeder_user_id TEXT NOT NULL,
    qr_code_token TEXT UNIQUE NOT NULL,
    passport_data JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'transferred', 'revoked')),
    transferred_to_owner_id TEXT,
    transferred_at TIMESTAMPTZ,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_passport_pet ON health_passports(pet_id);
CREATE INDEX IF NOT EXISTS idx_passport_qr ON health_passports(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_passport_breeder ON health_passports(breeder_user_id);
