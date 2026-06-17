-- ==========================================
-- Migration v5: Dynamic Purchase Plans & Multipliers
-- ==========================================

-- 1. Add purchase_plans jsonb column to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS purchase_plans jsonb DEFAULT '[{"minPurchase": 3, "lockDays": 1, "multiplier": 2.0}, {"minPurchase": 5, "lockDays": 5, "multiplier": 3.0}]'::jsonb;

-- 2. Add boost_multiplier numeric column to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS boost_multiplier numeric(10, 2) NOT NULL DEFAULT 1.00;
