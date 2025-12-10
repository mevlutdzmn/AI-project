-- Create shared_messages table for single message sharing
CREATE TABLE IF NOT EXISTS shared_messages (
    id SERIAL PRIMARY KEY,
    share_token VARCHAR(64) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    role VARCHAR(20) DEFAULT 'assistant',
    user_id INTEGER,
    view_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shared_messages_token ON shared_messages(share_token);
