-- 012_services_nutrition_insurance.sql
-- Multi-service architecture: adds service_type to promo_items/events,
-- creates nutrition_plans, insurance_risk_scores, insurance_policies, insurance_claims tables.

-- 1. Add service_type to promo_items (promo, nutrition, insurance)
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'promo';

-- 2. Add nutrition_data and insurance_data JSONB columns to promo_items
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS nutrition_data JSONB DEFAULT NULL;
ALTER TABLE promo_items ADD COLUMN IF NOT EXISTS insurance_data JSONB DEFAULT NULL;

-- 3. Index for service_type filtering
CREATE INDEX IF NOT EXISTS idx_promo_items_service_type ON promo_items(service_type, status);

-- 4. Add service_type to promo_events
ALTER TABLE promo_events ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'promo';

-- 5. Nutrition plans table
CREATE TABLE IF NOT EXISTS nutrition_plans (
    plan_id         TEXT PRIMARY KEY,
    pet_id          TEXT NOT NULL,
    owner_user_id   TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    plan_data       JSONB NOT NULL DEFAULT '{}',
    status          TEXT NOT NULL DEFAULT 'pending', -- pending, validated, rejected, expired
    validated_by    TEXT,
    validated_at    TIMESTAMPTZ,
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_pet ON nutrition_plans(pet_id, status);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_owner ON nutrition_plans(owner_user_id);

-- 6. Insurance risk scores table
CREATE TABLE IF NOT EXISTS insurance_risk_scores (
    score_id        SERIAL PRIMARY KEY,
    pet_id          TEXT NOT NULL,
    total_score     INT NOT NULL DEFAULT 0,        -- 0-100
    risk_class      TEXT NOT NULL DEFAULT 'low',   -- low, medium, high, very_high
    breakdown       JSONB NOT NULL DEFAULT '{}',   -- { age: 15, breed: 20, history: 10, ... }
    price_multiplier REAL NOT NULL DEFAULT 1.0,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insurance_risk_scores_pet ON insurance_risk_scores(pet_id, computed_at DESC);

-- 7. Insurance policies table
CREATE TABLE IF NOT EXISTS insurance_policies (
    policy_id       TEXT PRIMARY KEY,
    pet_id          TEXT NOT NULL,
    owner_user_id   TEXT NOT NULL,
    tenant_id       TEXT NOT NULL,
    promo_item_id   TEXT,
    status          TEXT NOT NULL DEFAULT 'quoted', -- quoted, active, expired, cancelled
    monthly_premium NUMERIC(10,2),
    coverage_data   JSONB DEFAULT '{}',
    start_date      DATE,
    end_date        DATE,
    risk_score_id   INT REFERENCES insurance_risk_scores(score_id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_pet ON insurance_policies(pet_id, status);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_owner ON insurance_policies(owner_user_id);

-- 8. Insurance claims table
CREATE TABLE IF NOT EXISTS insurance_claims (
    claim_id        TEXT PRIMARY KEY,
    policy_id       TEXT NOT NULL REFERENCES insurance_policies(policy_id),
    pet_id          TEXT NOT NULL,
    visit_data      JSONB DEFAULT '{}',
    amount          NUMERIC(10,2),
    status          TEXT NOT NULL DEFAULT 'draft', -- draft, submitted, approved, rejected
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_policy ON insurance_claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_pet ON insurance_claims(pet_id);
