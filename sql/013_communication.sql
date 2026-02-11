-- sql/013_communication.sql
-- Communication system: chat owner↔vet, chatbot AI, settings
-- Depends on: 001 (pets), 007 (users)

-- === Communication Settings (AI toggle per utente) ===
CREATE TABLE IF NOT EXISTS communication_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    ai_features_enabled BOOLEAN NOT NULL DEFAULT false,
    chatbot_enabled BOOLEAN NOT NULL DEFAULT false,
    auto_transcription_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- === Conversations (chat, voice_call, video_call tra owner e vet) ===
CREATE TABLE IF NOT EXISTS conversations (
    conversation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id) ON DELETE CASCADE,
    owner_user_id TEXT NOT NULL,
    vet_user_id TEXT,
    type TEXT NOT NULL DEFAULT 'chat'
        CHECK (type IN ('chat', 'voice_call', 'video_call')),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed', 'archived')),
    subject TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_pet ON conversations(pet_id);
CREATE INDEX IF NOT EXISTS idx_conversations_owner ON conversations(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_vet ON conversations(vet_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status) WHERE status = 'active';

-- === Messages (testo, media, system, transcription) ===
CREATE TABLE IF NOT EXISTS comm_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text'
        CHECK (type IN ('text', 'image', 'video', 'audio', 'file', 'system', 'transcription')),
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    media_size_bytes BIGINT,
    thumbnail_url TEXT,
    transcription TEXT,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comm_messages_conv ON comm_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comm_messages_unread ON comm_messages(conversation_id, is_read) WHERE is_read = false;

-- === Call Recordings ===
CREATE TABLE IF NOT EXISTS call_recordings (
    recording_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    recording_url TEXT NOT NULL,
    recording_type TEXT NOT NULL CHECK (recording_type IN ('audio', 'video')),
    duration_seconds INTEGER,
    file_size_bytes BIGINT,
    transcription_status TEXT DEFAULT 'none'
        CHECK (transcription_status IN ('none', 'pending', 'processing', 'completed', 'failed', 'skipped')),
    transcription_text TEXT,
    transcription_segments JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_call_recordings_conv ON call_recordings(conversation_id);

-- === Communication Attachments ===
CREATE TABLE IF NOT EXISTS comm_attachments (
    attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES comm_messages(message_id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha256 TEXT,
    is_image BOOLEAN DEFAULT false,
    thumbnail_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comm_attachments_msg ON comm_attachments(message_id);

-- === Chatbot AI Sessions (solo quando AI abilitata) ===
CREATE TABLE IF NOT EXISTS chat_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL REFERENCES pets(pet_id),
    owner_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'closed', 'expired')),
    triage_level TEXT CHECK (triage_level IN ('green', 'yellow', 'red')),
    summary TEXT,
    message_count INTEGER DEFAULT 0,
    last_message_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner ON chat_sessions(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_pet ON chat_sessions(pet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(status) WHERE status = 'active';

-- === Chatbot AI Messages ===
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    triage_level TEXT CHECK (triage_level IN ('green', 'yellow', 'red')),
    triage_action TEXT CHECK (triage_action IN ('monitor', 'vet_appointment', 'emergency')),
    follow_up_questions JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
