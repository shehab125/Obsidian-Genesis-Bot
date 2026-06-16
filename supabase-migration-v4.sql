-- ==========================================
-- Migration v4: Bot Active (Kill Switch) Settings
-- ==========================================

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS bot_active boolean NOT NULL DEFAULT true;
