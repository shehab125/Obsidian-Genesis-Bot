-- ==========================================
-- Migration v6: Max Contracts Limit Settings
-- ==========================================

-- 1. Add max_contracts_limit_enabled column to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS max_contracts_limit_enabled boolean NOT NULL DEFAULT false;

-- 2. Add max_contracts_limit column to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS max_contracts_limit integer NOT NULL DEFAULT 10;
