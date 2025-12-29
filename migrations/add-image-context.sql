-- Migration: Add image_context column for ChatGPT-style multi-turn image editing
-- Date: 2024-12-29
-- Description: Stores GPT-5.2 Responses API context (responseId, imageCallId) for multi-turn image editing

-- Add image_context column to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_context JSONB;

-- Add comment for documentation
COMMENT ON COLUMN messages.image_context IS 'Stores GPT-5.2 image generation context: { responseId: string, imageCallId: string, revisedPrompt?: string }';

-- Optional: Create index for faster lookups (uncomment if needed)
-- CREATE INDEX IF NOT EXISTS idx_messages_image_context ON messages USING gin (image_context) WHERE image_context IS NOT NULL;
