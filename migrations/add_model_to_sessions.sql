-- Add model column to sessions table
-- This stores the last used model for each chat session
-- When user switches to a session, frontend will restore this model

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS model TEXT;

-- Optional: Create index if you need to query by model
-- CREATE INDEX idx_sessions_model ON sessions(model);
