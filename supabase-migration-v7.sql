-- ==========================================
-- Migration v7: Mining Double Rewards Tracking Columns
-- ==========================================

-- 1. Add last_cycle_earned_tokens column to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_cycle_earned_tokens integer NOT NULL DEFAULT 0;

-- 2. Add last_cycle_doubled column to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_cycle_doubled boolean NOT NULL DEFAULT false;
