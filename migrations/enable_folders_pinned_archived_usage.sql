-- Migration: Enable folders, pinned, archived, and usage_logs features
-- Run this in Supabase SQL Editor

-- 1. Sessions tablosuna yeni kolonlar ekle (eğer yoksa)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;

-- 2. Folders tablosuna yeni kolonlar ekle (eğer yoksa)
ALTER TABLE folders ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#6366f1';
ALTER TABLE folders ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'folder';
ALTER TABLE folders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Usage logs tablosuna yeni kolonlar ekle (eğer yoksa)
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0;
ALTER TABLE usage_logs ADD COLUMN IF NOT EXISTS session_id TEXT;

-- 4. Mevcut NULL değerleri düzelt
UPDATE sessions SET pinned = false WHERE pinned IS NULL;
UPDATE sessions SET archived = false WHERE archived IS NULL;

-- 5. Index'ler oluştur (performans için)
CREATE INDEX IF NOT EXISTS idx_sessions_pinned ON sessions(pinned);
CREATE INDEX IF NOT EXISTS idx_sessions_archived ON sessions(archived);
CREATE INDEX IF NOT EXISTS idx_sessions_folder_id ON sessions(folder_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
