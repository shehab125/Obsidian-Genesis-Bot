-- ==========================================
-- Migration v8: Database Fixes for Wallet, Referral & Missing Columns
-- Run this in Supabase SQL Editor
-- ==========================================

-- 1. Fix task_completions check constraint to allow 0 reward (needed for referral tasks)
ALTER TABLE task_completions DROP CONSTRAINT IF EXISTS task_completions_reward_check;
ALTER TABLE task_completions ADD CONSTRAINT task_completions_reward_check CHECK (reward >= 0);

-- 2. Add missing wallet_address column to app_users table
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS wallet_address text;

-- 3. Add other potentially missing columns to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS boost_multiplier numeric(10, 2) NOT NULL DEFAULT 1.00;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_cycle_earned_tokens integer NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS last_cycle_doubled boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS unlock_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mining_cycles_completed integer NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cooldown_bypassed boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS influencer_code text;

-- 4. Ensure missing app_settings columns exist
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS max_contracts_limit_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS max_contracts_limit integer NOT NULL DEFAULT 10;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS purchase_plans jsonb DEFAULT '[{"minPurchase": 3, "lockDays": 1, "multiplier": 2.0}, {"minPurchase": 5, "lockDays": 5, "multiplier": 3.0}]'::jsonb;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS base_reward_usd numeric(10, 2) NOT NULL DEFAULT 1.00;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS withdrawal_lock_days integer NOT NULL DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS token_contract_address text NOT NULL DEFAULT '0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS quickswap_link text NOT NULL DEFAULT 'https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS owner_wallet text NOT NULL DEFAULT '0x7167C08FD45021c68993057d73f3b35944682635';

-- 5. Ensure referral platform type exists for tasks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'referral' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_platform')) THEN
    ALTER TYPE task_platform ADD VALUE 'referral';
  END IF;
END $$;

-- 6. Ensure task table columns exist
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_onboarding boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_social_media boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reward_usd numeric(10, 4) DEFAULT NULL;

-- 7. Ensure additional tables exist (MUST be created BEFORE backfill)
CREATE TABLE IF NOT EXISTS influencer_links (
  code text PRIMARY KEY,
  name text NOT NULL,
  user_id uuid REFERENCES app_users(id) ON DELETE CASCADE,
  commission_usd numeric(10, 2) NOT NULL DEFAULT 0.50,
  clicks integer NOT NULL DEFAULT 0,
  completions integer NOT NULL DEFAULT 0,
  total_commission_paid_usd numeric(12, 4) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mining_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  reward_usd numeric(10, 4) NOT NULL,
  reward_tokens numeric(16, 6) NOT NULL,
  notified boolean NOT NULL DEFAULT false,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  proof_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Add missing indexes
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_user_claimed ON mining_sessions(user_id, claimed);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_notified ON mining_sessions(notified) WHERE claimed = false;
CREATE INDEX IF NOT EXISTS idx_purchase_verification_requests_status ON purchase_verification_requests(status);

-- 9. BACKFILL: Copy wallet addresses from approved purchase_verification_requests
--    to app_users for users who were verified but wallet_address is still NULL
--    (Now safe because purchase_verification_requests table is guaranteed to exist)
DO $$
BEGIN
  UPDATE app_users u
  SET wallet_address = pvr.wallet_address
  FROM (
    SELECT DISTINCT ON (user_id) user_id, wallet_address
    FROM purchase_verification_requests
    WHERE status = 'approved' AND wallet_address IS NOT NULL AND wallet_address != ''
    ORDER BY user_id, created_at DESC
  ) pvr
  WHERE u.id = pvr.user_id
    AND u.purchase_verified = true
    AND (u.wallet_address IS NULL OR u.wallet_address = '');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Backfill skipped: %', SQLERRM;
END $$;

-- 10. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
