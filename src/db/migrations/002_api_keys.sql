-- Migration 002: Add user API key support
-- Allows multiple API keys per user, adds key_prefix column

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix TEXT DEFAULT 'sk_user';
ALTER TABLE api_keys ALTER COLUMN key_prefix SET DEFAULT 'sk_user';

-- Drop unique constraint on user_id (agents currently have 1 key, users can have multiple)
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_user_id_key;

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);
