-- sql/031_diagnostic_results.sql
-- B2B Phase 2: Diagnostic panels, results, notifications

-- === 1. Lab/imaging exam templates ===
CREATE TABLE IF NOT EXISTS diagnostic_panels (
    panel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(120) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('lab','imaging','histology','genetics','ecg','other')),
    parameters JSONB DEFAULT '[]'::jsonb,
    species VARCHAR(20),
    reference_ranges JSONB DEFAULT '{}'::jsonb,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_panels_category ON diagnostic_panels(category);

-- Seed: common diagnostic panels
INSERT INTO diagnostic_panels (name, category, description) VALUES
('Emocromo completo (CBC)', 'lab', 'Conta cellulare completa: globuli rossi, bianchi, piastrine, formula leucocitaria'),
('Profilo biochimico base', 'lab', 'Glucosio, urea, creatinina, ALT, AST, proteine totali, albumina'),
('Profilo biochimico completo', 'lab', 'Profilo base + bilirubina, fosfatasi alcalina, GGT, colesterolo, trigliceridi, calcio, fosforo'),
('Esame urine completo', 'lab', 'Analisi chimico-fisica e sedimento urinario'),
('Profilo tiroideo (T4, TSH)', 'lab', 'Ormoni tiroidei: T4 libero e TSH canino/felino'),
('Radiografia', 'imaging', 'Radiografia digitale in proiezioni standard'),
('Ecografia addominale', 'imaging', 'Ecografia addominale completa con sonde multifrequenza'),
('Ecocardiografia', 'imaging', 'Ecografia cardiaca con Doppler per valutazione funzionale'),
('ECG a 6 derivazioni', 'ecg', 'Elettrocardiogramma standard a 6 derivazioni'),
('Esame citologico', 'histology', 'Citologia da agoaspirato o impronta'),
('Test genetici di razza', 'genetics', 'Pannello malattie genetiche razza-specifiche');

-- === 2. Diagnostic results ===
CREATE TABLE IF NOT EXISTS diagnostic_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    panel_id UUID REFERENCES diagnostic_panels(panel_id),
    appointment_id UUID REFERENCES appointments(appointment_id),
    referral_id UUID REFERENCES referrals(referral_id),
    ordered_by_user_id UUID NOT NULL,
    ordered_by_role VARCHAR(20) NOT NULL CHECK (ordered_by_role IN ('vet_int','vet_ext')),
    result_status VARCHAR(20) NOT NULL DEFAULT 'ordered' CHECK (result_status IN ('ordered','sample_collected','processing','completed','reviewed','shared')),
    result_data JSONB,
    result_summary TEXT,
    ai_interpretation TEXT,
    out_of_range_flags JSONB DEFAULT '[]'::jsonb,
    performed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    reviewed_by_vet_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diag_results_pet ON diagnostic_results(pet_id);
CREATE INDEX IF NOT EXISTS idx_diag_results_referral ON diagnostic_results(referral_id);
CREATE INDEX IF NOT EXISTS idx_diag_results_status ON diagnostic_results(result_status) WHERE result_status NOT IN ('reviewed','shared');
CREATE INDEX IF NOT EXISTS idx_diag_results_appt ON diagnostic_results(appointment_id);

-- === 3. Result notifications ===
CREATE TABLE IF NOT EXISTS result_notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES diagnostic_results(result_id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    user_role VARCHAR(20),
    notification_type VARCHAR(30) NOT NULL CHECK (notification_type IN ('result_ready','result_reviewed','out_of_range_alert','result_shared')),
    read_at TIMESTAMPTZ,
    sent_via JSONB DEFAULT '["in_app"]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_result_notif_user ON result_notifications(user_id) WHERE read_at IS NULL;
