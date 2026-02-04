-- 004_documents.sql - Document storage (PR 8)
CREATE TABLE IF NOT EXISTS documents (
    document_id     UUID PRIMARY KEY,
    pet_id          UUID NOT NULL REFERENCES pets(pet_id),
    owner_user_id   TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    size_bytes      INTEGER NOT NULL,
    page_count      INTEGER,
    storage_key     TEXT NOT NULL,
    hash_sha256     TEXT NOT NULL,
    read_text       TEXT,
    owner_explanation TEXT,
    ai_status       TEXT DEFAULT 'none',
    ai_error        TEXT,
    ai_updated_at   TIMESTAMPTZ,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_pet ON documents(pet_id);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_user_id);
