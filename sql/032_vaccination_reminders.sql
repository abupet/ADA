-- sql/032_vaccination_reminders.sql
-- B2B Phase 3: Vaccination reminders, compliance tracking

-- === 1. Reminder vaccinali ===
CREATE TABLE IF NOT EXISTS vaccination_reminders (
    reminder_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_vaccination_id UUID NOT NULL REFERENCES pet_vaccinations(vaccination_id) ON DELETE CASCADE,
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL,
    reminder_date DATE NOT NULL,
    reminder_type TEXT NOT NULL DEFAULT '7_days_before'
        CHECK (reminder_type IN ('30_days_before', '7_days_before', '1_day_before', 'overdue')),
    sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMPTZ,
    sent_via TEXT DEFAULT 'in_app',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vax_reminders_date ON vaccination_reminders(reminder_date, sent)
    WHERE sent = false;
CREATE INDEX IF NOT EXISTS idx_vax_reminders_owner ON vaccination_reminders(owner_user_id, sent)
    WHERE sent = false;

-- === 2. Report compliance vaccinale (per allevamento) ===
CREATE TABLE IF NOT EXISTS vaccination_compliance_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    breeder_user_id TEXT NOT NULL,
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    total_pets INTEGER NOT NULL DEFAULT 0,
    vaccinated_on_time INTEGER NOT NULL DEFAULT 0,
    vaccinated_late INTEGER NOT NULL DEFAULT 0,
    missed INTEGER NOT NULL DEFAULT 0,
    compliance_rate NUMERIC(5,2),
    report_data JSONB DEFAULT '{}',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compliance_breeder ON vaccination_compliance_reports(breeder_user_id, generated_at DESC);
