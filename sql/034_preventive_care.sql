-- sql/034_preventive_care.sql
-- B2B Phase 3: AI-generated preventive care plans

-- === 1. Piani prevenzione ===
CREATE TABLE IF NOT EXISTS preventive_care_plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    generated_for_user_id TEXT NOT NULL,
    generated_for_role TEXT NOT NULL,
    plan_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
    ai_model TEXT DEFAULT 'gpt-4o',
    plan_data JSONB NOT NULL DEFAULT '{}',
    estimated_annual_cost NUMERIC(10,2),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'completed', 'expired')),
    approved_by_vet_id TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prev_plans_pet ON preventive_care_plans(pet_id, plan_year);
CREATE INDEX IF NOT EXISTS idx_prev_plans_user ON preventive_care_plans(generated_for_user_id, status);

-- === 2. Item del piano ===
CREATE TABLE IF NOT EXISTS preventive_care_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES preventive_care_plans(plan_id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('vaccination', 'screening', 'lab_test', 'nutrition', 'dental', 'parasite_control', 'exercise', 'other')),
    title TEXT NOT NULL,
    description TEXT,
    recommended_month INTEGER CHECK (recommended_month BETWEEN 1 AND 12),
    estimated_cost NUMERIC(8,2),
    priority TEXT DEFAULT 'recommended'
        CHECK (priority IN ('essential', 'recommended', 'optional')),
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    appointment_id UUID REFERENCES appointments(appointment_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prev_items_plan ON preventive_care_items(plan_id, recommended_month);
CREATE INDEX IF NOT EXISTS idx_prev_items_pending ON preventive_care_items(completed, recommended_month)
    WHERE completed = false;
