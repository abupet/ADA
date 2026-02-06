-- 008_promo_core.sql
-- PR 2: Tag System, Consent, Catalogo, Eligibility Engine

-- Tag dictionary with sensitivity levels
CREATE TABLE IF NOT EXISTS tag_dictionary (
    tag             TEXT PRIMARY KEY,
    label           TEXT NOT NULL,
    category        TEXT NOT NULL,          -- lifecycle, species, size, clinical, engagement, spend
    sensitivity     TEXT NOT NULL DEFAULT 'low',  -- low, medium, high
    derivation_rule JSONB DEFAULT '{}',     -- rule config for auto-computation
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tag dictionary version tracking
CREATE TABLE IF NOT EXISTS tag_dictionary_versions (
    version_id      SERIAL PRIMARY KEY,
    tag             TEXT NOT NULL,
    action          TEXT NOT NULL,          -- created, updated, deleted
    snapshot        JSONB NOT NULL,
    changed_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Computed tags per pet
CREATE TABLE IF NOT EXISTS pet_tags (
    pet_id          TEXT NOT NULL,
    tag             TEXT NOT NULL,
    value           TEXT,                   -- optional value (e.g. weight bucket)
    confidence      REAL DEFAULT 1.0,
    source          TEXT DEFAULT 'computed', -- computed, manual
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (pet_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_pet_tags_tag ON pet_tags(tag);

-- Consent management
CREATE TABLE IF NOT EXISTS consents (
    owner_user_id   TEXT NOT NULL,
    consent_type    TEXT NOT NULL,          -- marketing_global, marketing_brand, clinical_tags
    scope           TEXT NOT NULL DEFAULT 'global', -- global, or tenant_id
    status          TEXT NOT NULL DEFAULT 'opted_out', -- opted_in, opted_out, pending
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_user_id, consent_type, scope)
);

-- Consent version audit trail
CREATE TABLE IF NOT EXISTS consent_versions (
    version_id      SERIAL PRIMARY KEY,
    owner_user_id   TEXT NOT NULL,
    consent_type    TEXT NOT NULL,
    scope           TEXT NOT NULL,
    old_status      TEXT,
    new_status      TEXT NOT NULL,
    changed_by      TEXT,
    ip_address      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_versions_owner ON consent_versions(owner_user_id, created_at);

-- Promo items catalog
CREATE TABLE IF NOT EXISTS promo_items (
    promo_item_id   TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,          -- food_general, food_clinical, supplement, antiparasitic, accessory, service
    species         TEXT[] DEFAULT '{}',    -- dog, cat, all
    lifecycle_target TEXT[] DEFAULT '{}',   -- puppy, adult, senior
    description     TEXT,
    image_url       TEXT,
    product_url     TEXT,
    tags_include    TEXT[] DEFAULT '{}',    -- OR match
    tags_exclude    TEXT[] DEFAULT '{}',    -- AND NOT match
    priority        INT DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'draft', -- draft, in_review, published, retired
    version         INT NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_items_tenant ON promo_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_promo_items_status ON promo_items(status);

-- Promo item version snapshots
CREATE TABLE IF NOT EXISTS promo_item_versions (
    version_id      SERIAL PRIMARY KEY,
    promo_item_id   TEXT NOT NULL,
    version         INT NOT NULL,
    snapshot        JSONB NOT NULL,
    status          TEXT NOT NULL,
    changed_by      TEXT,
    change_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_item_versions_item ON promo_item_versions(promo_item_id);

-- Promo campaigns
CREATE TABLE IF NOT EXISTS promo_campaigns (
    campaign_id     TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL,
    name            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft', -- draft, active, paused, ended
    start_date      DATE,
    end_date        DATE,
    contexts        TEXT[] DEFAULT '{}',    -- post_visit, home_feed, etc.
    frequency_cap   JSONB DEFAULT '{}',     -- { per_session: 2, per_week: 4 }
    utm_source      TEXT DEFAULT 'ada',
    utm_medium      TEXT DEFAULT 'promo',
    utm_campaign    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_campaigns_tenant ON promo_campaigns(tenant_id, status);

-- Campaign-items M:N
CREATE TABLE IF NOT EXISTS campaign_items (
    campaign_id     TEXT NOT NULL REFERENCES promo_campaigns(campaign_id),
    promo_item_id   TEXT NOT NULL REFERENCES promo_items(promo_item_id),
    priority_override INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (campaign_id, promo_item_id)
);

-- Global policies (Super Admin)
CREATE TABLE IF NOT EXISTS global_policies (
    policy_key      TEXT PRIMARY KEY,
    policy_value    JSONB NOT NULL,
    description     TEXT,
    updated_by      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Explanation cache (OpenAI responses)
CREATE TABLE IF NOT EXISTS explanation_cache (
    cache_key       TEXT PRIMARY KEY,
    explanation     JSONB NOT NULL,
    model           TEXT,
    tokens_used     INT DEFAULT 0,
    latency_ms      INT DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_explanation_cache_expires ON explanation_cache(expires_at);

-- Tenant budgets for OpenAI calls
CREATE TABLE IF NOT EXISTS tenant_budgets (
    tenant_id       TEXT PRIMARY KEY,
    monthly_limit   INT NOT NULL DEFAULT 1000,  -- max OpenAI calls per month
    current_usage   INT NOT NULL DEFAULT 0,
    reset_day       INT NOT NULL DEFAULT 1,     -- day of month to reset
    last_reset      TIMESTAMPTZ,
    alert_threshold REAL DEFAULT 0.8,           -- alert at 80%
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promo events tracking
CREATE TABLE IF NOT EXISTS promo_events (
    event_id        SERIAL PRIMARY KEY,
    owner_user_id   TEXT,
    pet_id          TEXT,
    promo_item_id   TEXT,
    tenant_id       TEXT,
    event_type      TEXT NOT NULL,          -- impression, click, buy_click, dismissed, cta_click
    context         TEXT,                   -- post_visit, home_feed, pet_profile, faq_view, milestone
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_events_pet ON promo_events(pet_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_promo_events_item ON promo_events(promo_item_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_promo_events_owner ON promo_events(owner_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_promo_events_freq ON promo_events(owner_user_id, pet_id, context, event_type, created_at);

-- Vet flags (vet can flag inappropriate promos)
CREATE TABLE IF NOT EXISTS vet_flags (
    flag_id         SERIAL PRIMARY KEY,
    pet_id          TEXT NOT NULL,
    promo_item_id   TEXT NOT NULL,
    vet_user_id     TEXT NOT NULL,
    reason          TEXT,
    status          TEXT NOT NULL DEFAULT 'active', -- active, resolved
    resolved_by     TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vet_flags_active ON vet_flags(pet_id, promo_item_id) WHERE status = 'active';

-- Seed tag dictionary with 18 predefined tags
INSERT INTO tag_dictionary (tag, label, category, sensitivity, derivation_rule, description) VALUES
    ('lifecycle:puppy', 'Cucciolo', 'lifecycle', 'low', '{"type":"age","max_years":1}', 'Pet under 1 year old'),
    ('lifecycle:adult', 'Adulto', 'lifecycle', 'low', '{"type":"age","min_years":1}', 'Adult pet'),
    ('lifecycle:senior', 'Senior', 'lifecycle', 'low', '{"type":"age_size_dependent"}', 'Senior pet (age depends on size)'),
    ('species:dog', 'Cane', 'species', 'low', '{"type":"species","value":"cane"}', 'Dog'),
    ('species:cat', 'Gatto', 'species', 'low', '{"type":"species","value":"gatto"}', 'Cat'),
    ('size:small', 'Taglia piccola', 'size', 'low', '{"type":"weight","max_kg":10}', 'Small dog under 10kg'),
    ('size:medium', 'Taglia media', 'size', 'low', '{"type":"weight","min_kg":10,"max_kg":25}', 'Medium dog 10-25kg'),
    ('size:large', 'Taglia grande', 'size', 'low', '{"type":"weight","min_kg":25}', 'Large dog over 25kg'),
    ('clinical:joint_issues', 'Problemi articolari', 'clinical', 'high', '{"type":"keyword","keywords":["articolazioni","displasia","artrosi","zoppia","joint"]}', 'Joint/orthopedic issues'),
    ('clinical:skin_issues', 'Problemi dermatologici', 'clinical', 'high', '{"type":"keyword","keywords":["dermatite","prurito","allergia cutanea","pelle","skin"]}', 'Skin/dermatology issues'),
    ('clinical:digestive', 'Problemi digestivi', 'clinical', 'high', '{"type":"keyword","keywords":["vomito","diarrea","gastrite","digestione","intestino"]}', 'Digestive issues'),
    ('clinical:dental', 'Problemi dentali', 'clinical', 'high', '{"type":"keyword","keywords":["tartaro","gengivite","denti","dentale","dental"]}', 'Dental issues'),
    ('clinical:obesity', 'Sovrappeso', 'clinical', 'high', '{"type":"keyword","keywords":["sovrappeso","obesita","dieta","weight loss"]}', 'Overweight/obesity'),
    ('clinical:anxiety', 'Ansia/Stress', 'clinical', 'high', '{"type":"keyword","keywords":["ansia","stress","paura","fobia","comportamento"]}', 'Anxiety/behavioral issues'),
    ('clinical:parasite', 'Parassiti', 'clinical', 'high', '{"type":"keyword","keywords":["pulci","zecche","parassiti","filaria","vermi"]}', 'Parasite-related'),
    ('clinical:renal', 'Problemi renali', 'clinical', 'high', '{"type":"keyword","keywords":["renale","rene","insufficienza renale","creatinina","BUN"]}', 'Renal/kidney issues'),
    ('engagement:active', 'Utente attivo', 'engagement', 'medium', '{"type":"engagement","min_visits":3}', 'Active user with 3+ visits'),
    ('spend:high', 'Spesa elevata', 'spend', 'medium', '{"type":"spend","min_eur":100}', 'High-spend owner')
ON CONFLICT (tag) DO NOTHING;
