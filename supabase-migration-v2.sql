-- ==========================================
-- Migration v2: Onboarding, Referrals, Cooldown Lock Period
-- ==========================================

-- ------------------------------------------
-- ⚠️ STEP 1: RUN THIS LINE ALONE FIRST, THEN CLICK "RUN"
-- ------------------------------------------
-- Postgres requires enum type alterations to be committed before they can be used in data insertions.
ALTER TYPE task_platform ADD VALUE IF NOT EXISTS 'referral';


-- ------------------------------------------
-- ⚠️ STEP 2: AFTER STEP 1 COMPLETES successfully, SELECT AND RUN THE REST
-- ------------------------------------------

-- 1. Update app_users with onboarding, referral, unlock, and influencer columns
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS unlock_at timestamptz;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS influencer_code text;

-- 2. Update app_settings with lock duration and base reward settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS withdrawal_lock_days integer NOT NULL DEFAULT 0;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS base_reward_usd numeric(10, 2) NOT NULL DEFAULT 1.00;

-- 2.5. Create influencer_links table
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

-- 3. Update tasks with onboarding flag
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_onboarding boolean NOT NULL DEFAULT false;

-- 4. Create referral_rewards table to track bonus overrides
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references app_users(id) on delete cascade,
  referred_user_id uuid not null references app_users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

-- Index for referral lookups
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id ON referral_rewards(referrer_id);

-- 5. Seed onboarding tasks conditionally without PL/pgSQL blocks
INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding)
SELECT 'Follow X Account', 'Follow our official X account @obsidian_genesis to start mining.', 'x', 'https://x.com/obsidian_genesis', 100, 'active', true, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_onboarding = true);

INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding)
SELECT 'Retweet Pinned Tweet', 'Retweet our pinned tweet on X to verify your node connection.', 'x', 'https://x.com/obsidian_genesis/status/123456789', 100, 'active', true, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_onboarding = true AND title = 'Retweet Pinned Tweet');

INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding)
SELECT 'Invite 3 Friends', 'Invite 3 friends to complete onboarding. Share your referral link below.', 'referral', '', 150, 'active', false, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_onboarding = true AND platform = 'referral');
