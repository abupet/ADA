-- sql/033_loyalty_program.sql
-- B2B Phase 3: Loyalty program, referral fees, partnership levels

-- === 1. Livelli partnership ===
CREATE TABLE IF NOT EXISTS partnership_levels (
    level_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    min_referrals_year INTEGER NOT NULL DEFAULT 0,
    fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
    benefits JSONB DEFAULT '[]',
    priority_booking BOOLEAN DEFAULT false,
    teleconsult_discount_pct NUMERIC(5,2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed livelli
INSERT INTO partnership_levels (name, min_referrals_year, fee_percentage, benefits, priority_booking, teleconsult_discount_pct) VALUES
    ('Bronze', 0, 5.00, '["Accesso base alla piattaforma","Report mensile referral"]'::jsonb, false, 0),
    ('Silver', 20, 8.00, '["Priority booking","Report avanzati","Webinar gratuiti"]'::jsonb, true, 10),
    ('Gold', 50, 12.00, '["Priority booking","Report premium","Webinar + ECM gratuiti","Accesso anticipato nuovi servizi","Account manager dedicato"]'::jsonb, true, 25)
ON CONFLICT (name) DO NOTHING;

-- === 2. Fee referral ===
CREATE TABLE IF NOT EXISTS referral_fees (
    fee_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID NOT NULL REFERENCES referrals(referral_id) ON DELETE CASCADE,
    vet_ext_user_id TEXT NOT NULL,
    service_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
    fee_percentage NUMERIC(5,2) NOT NULL,
    fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    payment_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fees_vet_ext ON referral_fees(vet_ext_user_id, status);
CREATE INDEX IF NOT EXISTS idx_fees_referral ON referral_fees(referral_id);

-- === 3. Transazioni fee ===
CREATE TABLE IF NOT EXISTS fee_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vet_ext_user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('fee_earned', 'payout', 'adjustment')),
    amount NUMERIC(10,2) NOT NULL,
    balance_after NUMERIC(10,2),
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_tx_vet ON fee_transactions(vet_ext_user_id, created_at DESC);

-- === 4. Partnership vet_ext (livello attuale) ===
CREATE TABLE IF NOT EXISTS vet_partnerships (
    partnership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vet_ext_user_id TEXT NOT NULL UNIQUE,
    current_level_id UUID NOT NULL REFERENCES partnership_levels(level_id),
    referrals_this_year INTEGER DEFAULT 0,
    total_fees_earned NUMERIC(10,2) DEFAULT 0,
    total_fees_paid NUMERIC(10,2) DEFAULT 0,
    balance NUMERIC(10,2) DEFAULT 0,
    level_evaluated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partnerships_vet ON vet_partnerships(vet_ext_user_id);
