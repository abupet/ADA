-- 003_generic_changes.sql - Generic sync engine (PR 7)
CREATE TABLE IF NOT EXISTS changes (
    change_id     BIGSERIAL PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID NOT NULL,
    change_type   TEXT NOT NULL,
    record        JSONB,
    version       INTEGER,
    client_ts     TIMESTAMPTZ,
    device_id     TEXT,
    op_id         UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_changes_owner_cursor ON changes(owner_user_id, change_id);
CREATE INDEX IF NOT EXISTS idx_changes_entity ON changes(entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_changes_op_id ON changes(op_id) WHERE op_id IS NOT NULL;
