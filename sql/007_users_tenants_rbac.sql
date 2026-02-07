-- 007_users_tenants_rbac.sql
-- PR 1: Multi-user auth, RBAC, Multi-tenant
-- Dependency: npm install bcryptjs in backend

CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    base_role       TEXT NOT NULL DEFAULT 'owner',
    status          TEXT NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id   TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active',
    config      JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tenants (
    user_id     TEXT NOT NULL REFERENCES users(user_id),
    tenant_id   TEXT NOT NULL REFERENCES tenants(tenant_id),
    role        TEXT NOT NULL DEFAULT 'admin_brand',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant ON user_tenants(tenant_id);

-- Potenziare audit_log con tenant awareness
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_role TEXT;
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id, created_at);
