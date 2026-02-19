-- sql/023_call_conversations.sql
-- Call conversation support: parent link, call_id, updated_at fix for merge logic

-- 1. Parent conversation link (call conversation → original chat)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parent_conversation_id UUID
    REFERENCES conversations(conversation_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_parent
    ON conversations(parent_conversation_id) WHERE parent_conversation_id IS NOT NULL;

-- 2. Fix: add updated_at to comm_messages (required for transcription merge logic)
ALTER TABLE comm_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 3. Call ID to track the WebRTC call in the conversation
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS call_id TEXT;
