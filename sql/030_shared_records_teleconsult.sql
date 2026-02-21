-- sql/030_shared_records_teleconsult.sql
-- B2B Phase 2: Clinical consents, shared documents, teleconsult sessions/notes

-- === 1. Clinical consent management ===
CREATE TABLE IF NOT EXISTS clinical_consents (
    consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL,
    granted_to_user_id UUID NOT NULL,
    granted_to_role VARCHAR(20) NOT NULL CHECK (granted_to_role IN ('vet_int','vet_ext','breeder')),
    scope VARCHAR(30) NOT NULL DEFAULT 'full' CHECK (scope IN ('full','documents_only','results_only','soap_readonly')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','expired')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_pet ON clinical_consents(pet_id);
CREATE INDEX IF NOT EXISTS idx_consent_granted ON clinical_consents(granted_to_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_consent_unique ON clinical_consents(pet_id, owner_user_id, granted_to_user_id) WHERE status = 'active';

-- === 2. Shared clinical documents (bidirectional vet_ext <-> vet_int) ===
CREATE TABLE IF NOT EXISTS shared_clinical_documents (
    shared_doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id UUID REFERENCES referrals(referral_id),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL,
    uploaded_by_role VARCHAR(20) NOT NULL CHECK (uploaded_by_role IN ('vet_int','vet_ext')),
    document_type VARCHAR(40) NOT NULL DEFAULT 'generic' CHECK (document_type IN (
        'generic','lab_result','radiology','ecg','echo','histology',
        'referral_report','discharge_summary','prescription','certificate'
    )),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    original_filename VARCHAR(255),
    stored_filename VARCHAR(255),
    file_path TEXT,
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    is_report_final BOOLEAN DEFAULT false,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shared_docs_referral ON shared_clinical_documents(referral_id);
CREATE INDEX IF NOT EXISTS idx_shared_docs_pet ON shared_clinical_documents(pet_id);
CREATE INDEX IF NOT EXISTS idx_shared_docs_uploader ON shared_clinical_documents(uploaded_by_user_id);

-- === 3. Teleconsult sessions ===
CREATE TABLE IF NOT EXISTS teleconsult_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(conversation_id),
    referral_id UUID REFERENCES referrals(referral_id),
    requesting_vet_id UUID NOT NULL,
    specialist_vet_id UUID,
    specialty VARCHAR(60),
    reason TEXT,
    clinical_context JSONB,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_minutes INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','scheduled','in_progress','completed','cancelled','no_show')),
    ai_note_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teleconsult_requesting ON teleconsult_sessions(requesting_vet_id);
CREATE INDEX IF NOT EXISTS idx_teleconsult_specialist ON teleconsult_sessions(specialist_vet_id);
CREATE INDEX IF NOT EXISTS idx_teleconsult_scheduled ON teleconsult_sessions(scheduled_at);

-- === 4. Teleconsult notes (AI-generated or manual) ===
CREATE TABLE IF NOT EXISTS teleconsult_notes (
    note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES teleconsult_sessions(session_id) ON DELETE CASCADE,
    generated_by VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (generated_by IN ('ai','manual')),
    content_json JSONB,
    content_text TEXT,
    approved_by_specialist BOOLEAN DEFAULT false,
    shared_with_requester BOOLEAN DEFAULT false,
    approved_at TIMESTAMPTZ,
    shared_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teleconsult_notes_session ON teleconsult_notes(session_id);

-- === 5. Add teleconsult type to conversations ===
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check CHECK (type IN ('chat', 'voice_call', 'video_call', 'teleconsult'));
