-- Migration: Add input_type column to messages table
-- Purpose: ChatGPT-style tracking of voice vs text vs image messages
-- Date: 2024-12-15

-- Add input_type column (nullable for existing messages)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS input_type TEXT DEFAULT 'text';

-- Add index for filtering by input_type (optional, for analytics)
CREATE INDEX IF NOT EXISTS idx_messages_input_type ON messages(input_type);

-- Comment for documentation
COMMENT ON COLUMN messages.input_type IS 'Message input type: text, voice, or image. Default is text.';
