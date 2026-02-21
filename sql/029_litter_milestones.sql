-- sql/029_litter_milestones.sql
-- B2B Phase 2: Litter milestones, puppy weights, milestone templates, passport enhancements

-- === 1. Milestone timeline ===
CREATE TABLE IF NOT EXISTS litter_milestones (
    milestone_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    litter_id UUID NOT NULL REFERENCES litters(litter_id) ON DELETE CASCADE,
    milestone_type VARCHAR(40) NOT NULL CHECK (milestone_type IN (
        'mating','pregnancy_confirmed','ultrasound_1','ultrasound_2','xray',
        'prenatal_checkup','birth','neonatal_checkup','first_vaccination',
        'microchip','weaning_start','weaning_complete','vet_health_check','deworming','custom'
    )),
    custom_label VARCHAR(120),
    scheduled_date DATE,
    completed_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','completed','skipped','overdue')),
    notes TEXT,
    performed_by_vet_id UUID,
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milestones_litter ON litter_milestones(litter_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON litter_milestones(status);

-- === 2. Puppy weight tracking ===
CREATE TABLE IF NOT EXISTS puppy_weights (
    weight_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    weight_grams INTEGER NOT NULL CHECK (weight_grams > 0),
    measured_date DATE NOT NULL DEFAULT CURRENT_DATE,
    measured_by VARCHAR(120),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_puppy_weights_pet ON puppy_weights(pet_id);

-- === 3. Milestone templates (auto-generation by species) ===
CREATE TABLE IF NOT EXISTS milestone_templates (
    template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    species VARCHAR(20) NOT NULL,
    breed VARCHAR(80),
    milestone_type VARCHAR(40) NOT NULL,
    days_from_mating INTEGER NOT NULL,
    description_it TEXT,
    description_en TEXT,
    is_mandatory BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_milestone_tmpl_species ON milestone_templates(species);

-- Seed: dog templates
INSERT INTO milestone_templates (species, milestone_type, days_from_mating, description_it, description_en, is_mandatory) VALUES
('dog', 'mating', 0, 'Accoppiamento', 'Mating', true),
('dog', 'pregnancy_confirmed', 25, 'Conferma gravidanza (ecografia)', 'Pregnancy confirmation (ultrasound)', true),
('dog', 'ultrasound_1', 28, 'Prima ecografia di controllo', 'First control ultrasound', false),
('dog', 'ultrasound_2', 45, 'Seconda ecografia — conteggio cuccioli', 'Second ultrasound — puppy count', false),
('dog', 'xray', 55, 'Radiografia per conteggio definitivo', 'X-ray for final count', false),
('dog', 'prenatal_checkup', 58, 'Visita prenatale', 'Prenatal checkup', true),
('dog', 'birth', 63, 'Parto previsto', 'Expected birth', true),
('dog', 'neonatal_checkup', 64, 'Controllo neonatale prime 24h', 'Neonatal checkup first 24h', true),
('dog', 'first_vaccination', 105, 'Prima vaccinazione cuccioli (6 sett.)', 'First puppy vaccination (6 wk)', true),
('dog', 'microchip', 105, 'Applicazione microchip', 'Microchip application', true),
('dog', 'deworming', 77, 'Primo trattamento antiparassitario', 'First deworming treatment', true),
('dog', 'weaning_start', 84, 'Inizio svezzamento (3 sett.)', 'Weaning start (3 wk)', false),
('dog', 'weaning_complete', 119, 'Svezzamento completo (8 sett.)', 'Weaning complete (8 wk)', false);

-- Seed: cat templates
INSERT INTO milestone_templates (species, milestone_type, days_from_mating, description_it, description_en, is_mandatory) VALUES
('cat', 'mating', 0, 'Accoppiamento', 'Mating', true),
('cat', 'pregnancy_confirmed', 20, 'Conferma gravidanza (ecografia)', 'Pregnancy confirmation (ultrasound)', true),
('cat', 'ultrasound_1', 25, 'Ecografia di controllo', 'Control ultrasound', false),
('cat', 'prenatal_checkup', 55, 'Visita prenatale', 'Prenatal checkup', true),
('cat', 'birth', 65, 'Parto previsto', 'Expected birth', true),
('cat', 'neonatal_checkup', 66, 'Controllo neonatale prime 24h', 'Neonatal checkup first 24h', true),
('cat', 'first_vaccination', 121, 'Prima vaccinazione gattini (8 sett.)', 'First kitten vaccination (8 wk)', true),
('cat', 'microchip', 121, 'Applicazione microchip', 'Microchip application', true),
('cat', 'deworming', 86, 'Primo trattamento antiparassitario', 'First deworming treatment', true),
('cat', 'weaning_start', 93, 'Inizio svezzamento (4 sett.)', 'Weaning start (4 wk)', false),
('cat', 'weaning_complete', 121, 'Svezzamento completo (8 sett.)', 'Weaning complete (8 wk)', false),
('cat', 'vet_health_check', 128, 'Visita veterinaria pre-cessione', 'Pre-sale vet health check', true);

-- === 4. Health passport enhancements ===
ALTER TABLE health_passports ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE health_passports ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ;
ALTER TABLE health_passports ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE health_passports ADD COLUMN IF NOT EXISTS activated_by_user_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_passport_pet_active ON health_passports(pet_id) WHERE status = 'active';
