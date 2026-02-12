-- 015_comm_attachments_data.sql
-- Add BYTEA column for file data storage (Render has ephemeral FS)
ALTER TABLE comm_attachments ADD COLUMN IF NOT EXISTS file_data BYTEA;
