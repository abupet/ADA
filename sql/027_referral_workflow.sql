-- sql/027_referral_workflow.sql
-- B2B Phase 1: Enhanced referral workflow with status tracking and SLA

-- === 1. Referral tracking ===
CREATE TABLE IF NOT EXISTS referrals (
    referral_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(conversation_id) ON DELETE SET NULL,
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    referring_vet_id TEXT NOT NULL,
    receiving_vet_id TEXT,
    specialty TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'programmabile'
        CHECK (urgency IN ('entro_24h', 'entro_1_settimana', 'programmabile')),
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN (
            'submitted', 'accepted', 'scheduled', 'in_progress',
            'report_pending', 'report_ready', 'closed', 'rejected', 'cancelled'
        )),
    referral_form JSONB NOT NULL DEFAULT '{}',
    clinical_notes TEXT,
    report_document_id UUID,
    sla_accept_by TIMESTAMPTZ,
    sla_report_by TIMESTAMPTZ,
    sla_accept_breached BOOLEAN DEFAULT false,
    sla_report_breached BOOLEAN DEFAULT false,
    accepted_at TIMESTAMPTZ,
    scheduled_at TIMESTAMPTZ,
    appointment_date TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    report_ready_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referring ON referrals(referring_vet_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_receiving ON referrals(receiving_vet_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_pet ON referrals(pet_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status, created_at DESC);

-- === 2. Audit trail ===
CREATE TABLE IF NOT EXISTS referral_status_log (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(referral_id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_log_referral ON referral_status_log(referral_id, created_at);

-- === 3. SLA configuration ===
CREATE TABLE IF NOT EXISTS referral_sla_config (
    sla_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    specialty TEXT NOT NULL,
    urgency TEXT NOT NULL,
    accept_hours INTEGER NOT NULL DEFAULT 24,
    report_hours INTEGER NOT NULL DEFAULT 72,
    tenant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sla_unique ON referral_sla_config(specialty, urgency, COALESCE(tenant_id, '__global__'));

-- Seed SLA defaults (9 specialità × 3 urgenze = 27 righe)
INSERT INTO referral_sla_config (specialty, urgency, accept_hours, report_hours) VALUES
    ('diagnostica_immagini', 'entro_24h', 2, 24),
    ('diagnostica_immagini', 'entro_1_settimana', 24, 72),
    ('diagnostica_immagini', 'programmabile', 48, 120),
    ('chirurgia_ortopedia', 'entro_24h', 2, 48),
    ('chirurgia_ortopedia', 'entro_1_settimana', 24, 120),
    ('chirurgia_ortopedia', 'programmabile', 48, 168),
    ('cardiologia', 'entro_24h', 2, 24),
    ('cardiologia', 'entro_1_settimana', 24, 72),
    ('cardiologia', 'programmabile', 48, 120),
    ('endoscopia_gastro', 'entro_24h', 4, 48),
    ('endoscopia_gastro', 'entro_1_settimana', 24, 96),
    ('endoscopia_gastro', 'programmabile', 48, 168),
    ('dermatologia', 'entro_24h', 4, 48),
    ('dermatologia', 'entro_1_settimana', 24, 96),
    ('dermatologia', 'programmabile', 48, 168),
    ('neurologia', 'entro_24h', 2, 48),
    ('neurologia', 'entro_1_settimana', 24, 96),
    ('neurologia', 'programmabile', 48, 168),
    ('oftalmologia', 'entro_24h', 4, 48),
    ('oftalmologia', 'entro_1_settimana', 24, 96),
    ('oftalmologia', 'programmabile', 48, 168),
    ('oncologia', 'entro_24h', 4, 48),
    ('oncologia', 'entro_1_settimana', 24, 120),
    ('oncologia', 'programmabile', 48, 168),
    ('medicina_interna', 'entro_24h', 4, 48),
    ('medicina_interna', 'entro_1_settimana', 24, 96),
    ('medicina_interna', 'programmabile', 48, 168)
ON CONFLICT DO NOTHING;

-- === 4. Analytics view ===
CREATE OR REPLACE VIEW referral_analytics AS
SELECT
    r.referring_vet_id,
    u_ref.display_name AS referring_vet_name,
    r.specialty, r.urgency, r.status,
    r.sla_accept_breached, r.sla_report_breached,
    EXTRACT(EPOCH FROM (r.accepted_at - r.created_at))/3600 AS hours_to_accept,
    EXTRACT(EPOCH FROM (r.report_ready_at - r.completed_at))/3600 AS hours_to_report,
    EXTRACT(EPOCH FROM (r.closed_at - r.created_at))/86400 AS days_total,
    r.created_at
FROM referrals r
LEFT JOIN users u_ref ON r.referring_vet_id = u_ref.user_id;
