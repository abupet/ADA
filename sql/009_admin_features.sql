-- 009_admin_features.sql
-- PR 4: Brand ingest jobs (wizard staging), daily stats materialization

-- Brand ingest jobs (CSV import tracking)
CREATE TABLE IF NOT EXISTS brand_ingest_jobs (
    job_id          TEXT PRIMARY KEY,
    tenant_id       TEXT NOT NULL REFERENCES tenants(tenant_id),
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    operation       TEXT NOT NULL DEFAULT 'append',   -- append, upsert, reset
    total_rows      INT NOT NULL DEFAULT 0,
    imported        INT NOT NULL DEFAULT 0,
    skipped         INT NOT NULL DEFAULT 0,
    errors          JSONB DEFAULT '[]',
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_brand_ingest_jobs_tenant ON brand_ingest_jobs(tenant_id, created_at DESC);

-- Brand products staging (intermediate staging before publish)
CREATE TABLE IF NOT EXISTS brand_products_staging (
    staging_id      TEXT PRIMARY KEY,
    job_id          TEXT NOT NULL REFERENCES brand_ingest_jobs(job_id),
    tenant_id       TEXT NOT NULL REFERENCES tenants(tenant_id),
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    species         TEXT[] DEFAULT '{}',
    lifecycle_target TEXT[] DEFAULT '{}',
    description     TEXT,
    image_url       TEXT,
    product_url     TEXT,
    tags_include    TEXT[] DEFAULT '{}',
    tags_exclude    TEXT[] DEFAULT '{}',
    priority        INT DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, rejected
    review_notes    TEXT,
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brand_products_staging_job ON brand_products_staging(job_id);
CREATE INDEX IF NOT EXISTS idx_brand_products_staging_tenant ON brand_products_staging(tenant_id, status);

-- Materialized daily stats for fast dashboard queries
CREATE TABLE IF NOT EXISTS promo_event_daily_stats (
    tenant_id       TEXT NOT NULL,
    promo_item_id   TEXT NOT NULL,
    context         TEXT NOT NULL DEFAULT '',
    event_type      TEXT NOT NULL,
    event_date      DATE NOT NULL,
    event_count     INT NOT NULL DEFAULT 0,
    unique_pets     INT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, promo_item_id, context, event_type, event_date)
);
CREATE INDEX IF NOT EXISTS idx_promo_event_daily_stats_tenant_date ON promo_event_daily_stats(tenant_id, event_date);
