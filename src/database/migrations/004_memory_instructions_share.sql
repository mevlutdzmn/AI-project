-- Memory & Custom Instructions Migration
-- Run this to add new tables for Memory, Custom Instructions, and Shared Chats

-- User Memories table
CREATE TABLE IF NOT EXISTS user_memories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, key)
);

-- Custom Instructions table
CREATE TABLE IF NOT EXISTS custom_instructions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    about_user TEXT,
    response_style TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Shared Chats table
CREATE TABLE IF NOT EXISTS shared_chats (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    share_token VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255),
    is_public BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_chats_session_id ON shared_chats(session_id);
CREATE INDEX IF NOT EXISTS idx_shared_chats_token ON shared_chats(share_token);
