-- 005_audit_log.sql - Audit trail (PR 11)
CREATE TABLE IF NOT EXISTS audit_log (
    log_id      BIGSERIAL PRIMARY KEY,
    who         TEXT NOT NULL,
    action      TEXT NOT NULL,
    entity_id   TEXT,
    entity_type TEXT,
    outcome     TEXT DEFAULT 'success',
    details     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_who ON audit_log(who);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, created_at);
