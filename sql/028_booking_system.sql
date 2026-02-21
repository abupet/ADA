-- sql/028_booking_system.sql
-- B2B Phase 1: Online booking system

-- === 1. Catalogo servizi prenotabili ===
CREATE TABLE IF NOT EXISTS bookable_services (
    service_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'general'
        CHECK (category IN ('visit', 'diagnostic', 'surgery', 'vaccination', 'screening', 'teleconsult', 'other')),
    specialty TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price NUMERIC(10,2),
    price_breeder NUMERIC(10,2),
    currency TEXT DEFAULT 'EUR',
    requires_referral BOOLEAN DEFAULT false,
    available_for JSONB DEFAULT '["owner","breeder","vet_ext"]',
    tenant_id TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'draft', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookable_services_cat ON bookable_services(category, status);
CREATE INDEX IF NOT EXISTS idx_bookable_services_tenant ON bookable_services(tenant_id, status);

-- === 2. Slot disponibilità ===
CREATE TABLE IF NOT EXISTS availability_slots (
    slot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID NOT NULL REFERENCES bookable_services(service_id) ON DELETE CASCADE,
    vet_user_id TEXT,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_bookings INTEGER NOT NULL DEFAULT 1,
    current_bookings INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'available'
        CHECK (status IN ('available', 'full', 'blocked')),
    tenant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slots_service_date ON availability_slots(service_id, slot_date, status);
CREATE INDEX IF NOT EXISTS idx_slots_available ON availability_slots(slot_date, status)
    WHERE status = 'available';

-- === 3. Prenotazioni ===
CREATE TABLE IF NOT EXISTS appointments (
    appointment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID REFERENCES availability_slots(slot_id) ON DELETE SET NULL,
    service_id UUID NOT NULL REFERENCES bookable_services(service_id),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    booked_by TEXT NOT NULL,
    booked_by_role TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    vet_user_id TEXT,
    referral_id UUID REFERENCES referrals(referral_id),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show')),
    price NUMERIC(10,2),
    notes TEXT,
    cancellation_reason TEXT,
    reminder_sent BOOLEAN DEFAULT false,
    tenant_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appt_pet ON appointments(pet_id, appointment_date DESC);
CREATE INDEX IF NOT EXISTS idx_appt_booked ON appointments(booked_by, appointment_date DESC);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(appointment_date, status);

-- === 4. Prenotazioni in blocco (breeder) ===
CREATE TABLE IF NOT EXISTS bulk_bookings (
    bulk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    breeder_user_id TEXT NOT NULL,
    service_id UUID NOT NULL REFERENCES bookable_services(service_id),
    pet_ids JSONB NOT NULL DEFAULT '[]',
    appointment_ids JSONB DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'partial', 'cancelled')),
    total_pets INTEGER NOT NULL DEFAULT 0,
    total_price NUMERIC(10,2),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bulk_breeder ON bulk_bookings(breeder_user_id, status);

-- === 5. Seed servizi prenotabili ===
INSERT INTO bookable_services (name, description, category, specialty, duration_minutes, price, price_breeder, requires_referral, available_for) VALUES
    ('Visita Generale', 'Visita clinica generale completa', 'visit', NULL, 30, 50.00, 40.00, false, '["owner","breeder"]'),
    ('Vaccinazione', 'Vaccinazione standard (polivalente)', 'vaccination', NULL, 15, 35.00, 25.00, false, '["owner","breeder"]'),
    ('Radiografia (2 proiezioni)', 'Esame radiografico standard', 'diagnostic', 'diagnostica_immagini', 30, 120.00, 100.00, true, '["vet_ext","breeder"]'),
    ('Ecografia Addominale', 'Ecografia addominale completa', 'diagnostic', 'diagnostica_immagini', 45, 150.00, 130.00, true, '["vet_ext","breeder"]'),
    ('TC (Tomografia Computerizzata)', 'TC con/senza mezzo di contrasto', 'diagnostic', 'diagnostica_immagini', 60, 350.00, 300.00, true, '["vet_ext"]'),
    ('Ecocardiografia', 'Eco cardiaca completa con Doppler', 'diagnostic', 'cardiologia', 45, 180.00, 160.00, true, '["vet_ext","breeder"]'),
    ('Visita Ortopedica', 'Valutazione ortopedica specialistica', 'visit', 'chirurgia_ortopedia', 45, 100.00, 85.00, true, '["vet_ext","breeder"]'),
    ('Screening Displasia Anca', 'Rx ufficiale per certificazione displasia', 'screening', 'chirurgia_ortopedia', 45, 200.00, 150.00, false, '["owner","breeder"]'),
    ('Visita Dermatologica', 'Consulenza dermatologica + citologia', 'visit', 'dermatologia', 45, 120.00, 100.00, true, '["vet_ext","breeder"]'),
    ('Gastroscopia + Biopsie', 'Endoscopia digestiva con prelievi', 'diagnostic', 'endoscopia_gastro', 90, 450.00, 400.00, true, '["vet_ext"]'),
    ('Visita Neurologica', 'Esame neurologico completo', 'visit', 'neurologia', 60, 130.00, 110.00, true, '["vet_ext"]'),
    ('Visita Oculistica', 'Esame oftalmologico completo', 'visit', 'oftalmologia', 45, 110.00, 95.00, true, '["vet_ext","breeder"]'),
    ('Teleconsulto Specialistico', 'Consulto video 30 min con specialista', 'teleconsult', NULL, 30, 80.00, 70.00, false, '["vet_ext"]')
ON CONFLICT DO NOTHING;
