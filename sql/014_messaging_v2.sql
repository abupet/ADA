-- sql/014_messaging_v2.sql
-- Messaging v2: unify human chat and AI chatbot into a single system
-- Depends on: 013_communication.sql

-- === 1. conversations: pet opzionale + tipo destinatario ===
ALTER TABLE conversations ALTER COLUMN pet_id DROP NOT NULL;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS recipient_type TEXT NOT NULL DEFAULT 'human'
    CHECK (recipient_type IN ('human', 'ai'));

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS triage_level TEXT
    CHECK (triage_level IN ('green', 'yellow', 'red'));

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_conversations_recipient_type
    ON conversations(recipient_type, owner_user_id);

-- === 2. comm_messages: delivery status, reply, soft delete, AI fields ===
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sent', 'delivered', 'read'));
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID
    REFERENCES comm_messages(message_id) ON DELETE SET NULL;

ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS deleted_by TEXT;

ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS ai_role TEXT
    CHECK (ai_role IN ('user', 'assistant', 'system'));
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS triage_level TEXT
    CHECK (triage_level IN ('green', 'yellow', 'red'));
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS triage_action TEXT
    CHECK (triage_action IN ('monitor', 'vet_appointment', 'emergency'));
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS follow_up_questions JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_comm_messages_reply
    ON comm_messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comm_messages_active
    ON comm_messages(conversation_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comm_messages_delivery
    ON comm_messages(conversation_id, delivery_status) WHERE delivery_status != 'read';

-- === 3. push_subscriptions: Web Push ===
CREATE TABLE IF NOT EXISTS push_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- === 4. notification_preferences ===
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    push_new_message BOOLEAN NOT NULL DEFAULT true,
    push_incoming_call BOOLEAN NOT NULL DEFAULT true,
    push_conversation_closed BOOLEAN NOT NULL DEFAULT false,
    show_message_preview BOOLEAN NOT NULL DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- === 5. conversation_seen: ultimo accesso per utente ===
CREATE TABLE IF NOT EXISTS conversation_seen (
    conversation_id UUID NOT NULL REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(conversation_id, user_id)
);

-- === 6. users.last_seen_at ===
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- === 7. Migrate data from chat_sessions / chat_messages ===
-- Migrare sessioni chatbot esistenti in conversations
INSERT INTO conversations (
    conversation_id, pet_id, owner_user_id, vet_user_id,
    type, status, subject, recipient_type, triage_level, message_count,
    created_at, updated_at
)
SELECT
    session_id,
    pet_id,
    owner_user_id,
    'ada-assistant',
    'chat',
    CASE WHEN status = 'active' THEN 'active' ELSE 'closed' END,
    COALESCE(summary, 'Conversazione con ADA'),
    'ai',
    triage_level,
    message_count,
    created_at,
    COALESCE(last_message_at, created_at)
FROM chat_sessions
ON CONFLICT (conversation_id) DO NOTHING;

-- Migrare messaggi chatbot in comm_messages
INSERT INTO comm_messages (
    message_id, conversation_id, sender_id,
    type, content, ai_role, triage_level, triage_action, follow_up_questions,
    delivery_status, created_at
)
SELECT
    message_id,
    session_id,
    CASE WHEN role = 'user' THEN owner_user_id ELSE 'ada-assistant' END,
    'text',
    content,
    role,
    triage_level,
    triage_action,
    COALESCE(follow_up_questions, '[]'),
    'read',
    created_at
FROM chat_messages cm
JOIN chat_sessions cs ON cs.session_id = cm.session_id
ON CONFLICT (message_id) DO NOTHING;
