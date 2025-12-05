-- Migration: Create user_settings table
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS user_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    
    -- General settings
    theme TEXT DEFAULT 'dark',
    language TEXT DEFAULT 'fa',
    show_extra_models BOOLEAN DEFAULT false,
    
    -- Notification settings
    email_notifications BOOLEAN DEFAULT true,
    browser_notifications BOOLEAN DEFAULT false,
    
    -- Data & Privacy settings
    save_history BOOLEAN DEFAULT true,
    improve_model BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_settings_updated_at ON user_settings;
CREATE TRIGGER user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_user_settings_updated_at();
