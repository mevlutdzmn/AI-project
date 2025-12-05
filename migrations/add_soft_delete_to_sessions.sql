-- Migration: Add soft delete columns to sessions table
-- Run this in Supabase SQL Editor

-- Add is_deleted column (default false for existing records)
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;

-- Add deleted_at column
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- Create index for better performance on filtering
CREATE INDEX IF NOT EXISTS idx_sessions_is_deleted ON sessions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_sessions_user_deleted ON sessions(user_id, is_deleted);
