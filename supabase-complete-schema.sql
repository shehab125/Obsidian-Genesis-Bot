-- =========================================================================
-- OBSIDIAN GENESIS BOT - UNIFIED DATABASE SCHEMA & MIGRATIONS
-- Run this entire script in your Supabase SQL Editor to set up the database
-- =========================================================================

-- 1. Create custom enum types
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_platform') THEN
    CREATE TYPE task_platform AS ENUM ('telegram', 'x', 'referral');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('active', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'submission_status') THEN
    CREATE TYPE submission_status AS ENUM ('pending', 'approved', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'withdrawal_status') THEN
    CREATE TYPE withdrawal_status AS ENUM ('pending', 'paid', 'rejected');
  END IF;
END $$;

-- 2. Create app_users table
CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id text UNIQUE NOT NULL,
  username text,
  display_name text NOT NULL,
  balance integer NOT NULL DEFAULT 0,
  balance_pending integer NOT NULL DEFAULT 0,
  balance_withdrawable integer NOT NULL DEFAULT 0,
  purchase_verified boolean NOT NULL DEFAULT false,
  purchase_verified_at timestamptz,
  frozen boolean NOT NULL DEFAULT false,
  onboarding_completed boolean NOT NULL DEFAULT false,
  referred_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  referral_count integer NOT NULL DEFAULT 0,
  unlock_at timestamptz,
  mining_cycles_completed integer NOT NULL DEFAULT 0,
  cooldown_bypassed boolean NOT NULL DEFAULT false,
  influencer_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
  id boolean PRIMARY KEY DEFAULT true,
  minimum_withdrawal_points integer NOT NULL DEFAULT 500,
  required_purchase_usd numeric(10, 2) NOT NULL DEFAULT 3.00,
  purchase_condition_enabled boolean NOT NULL DEFAULT true,
  token_usd_price numeric(12, 6) NOT NULL DEFAULT 0.001,
  withdrawal_lock_days integer NOT NULL DEFAULT 0,
  base_reward_usd numeric(10, 2) NOT NULL DEFAULT 1.00,
  token_contract_address text NOT NULL DEFAULT '0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f',
  quickswap_link text NOT NULL DEFAULT 'https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F',
  owner_wallet text NOT NULL DEFAULT '0x7167C08FD45021c68993057d73f3b35944682635',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = true)
);

-- Initialize app_settings row if empty
INSERT INTO app_settings (
  id,
  minimum_withdrawal_points,
  required_purchase_usd,
  purchase_condition_enabled,
  token_usd_price,
  withdrawal_lock_days,
  base_reward_usd,
  token_contract_address,
  quickswap_link,
  owner_wallet
)
VALUES (
  true, 
  500, 
  3.00, 
  true, 
  0.001, 
  0, 
  1.00,
  '0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f',
  'https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F',
  '0x7167C08FD45021c68993057d73f3b35944682635'
)
ON CONFLICT (id) DO UPDATE SET
  token_contract_address = EXCLUDED.token_contract_address,
  quickswap_link = EXCLUDED.quickswap_link,
  owner_wallet = EXCLUDED.owner_wallet;

-- 3.5. Create influencer_links table
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

-- 4. Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  platform task_platform NOT NULL,
  target_url text NOT NULL,
  reward integer NOT NULL CHECK (reward > 0),
  status task_status NOT NULL DEFAULT 'active',
  proof_required boolean NOT NULL DEFAULT false,
  is_onboarding boolean NOT NULL DEFAULT false,
  is_social_media boolean NOT NULL DEFAULT false,
  reward_usd numeric(10, 4) DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Create task_completions table
CREATE TABLE IF NOT EXISTS task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  reward integer NOT NULL CHECK (reward > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id)
);

-- 6. Create review_submissions table
CREATE TABLE IF NOT EXISTS review_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  proof_url text NOT NULL,
  note text,
  status submission_status NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Create withdrawal_requests table
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  wallet_address text NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Create purchase_verification_requests table
CREATE TABLE IF NOT EXISTS purchase_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  wallet_address text NOT NULL,
  proof_url text NOT NULL,
  status submission_status NOT NULL DEFAULT 'pending',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Create referral_rewards table
CREATE TABLE IF NOT EXISTS referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  amount integer NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. Create mining_sessions table
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

-- 11. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 12. Create Indexes
CREATE INDEX IF NOT EXISTS idx_task_completions_user_id ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_review_submissions_status ON review_submissions(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_verification_requests_status ON purchase_verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_id ON referral_rewards(referrer_id);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_user_claimed ON mining_sessions(user_id, claimed);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_notified ON mining_sessions(notified) WHERE claimed = false;

-- 13. Seed Onboarding Tasks (Phase 1)
INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding)
SELECT 'Follow X Account', 'Follow our official X account @obsidian_genesis to start mining.', 'x', 'https://x.com/obsidian_genesis', 100, 'active', true, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_onboarding = true AND title = 'Follow X Account');

INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding)
SELECT 'Retweet Pinned Tweet', 'Retweet our pinned tweet on X to verify your node connection.', 'x', 'https://x.com/obsidian_genesis/status/123456789', 100, 'active', true, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_onboarding = true AND title = 'Retweet Pinned Tweet');

INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding)
SELECT 'Invite 3 Friends', 'Invite 3 friends to complete onboarding. Share your referral link below.', 'referral', '', 150, 'active', false, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_onboarding = true AND platform = 'referral');

-- 14. Seed Social Media Tasks (Phase 2 - 0.1$ reward each)
INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding, reward_usd, is_social_media)
SELECT 'Join Official Telegram Channel', 'Join our official Telegram news channel to stay updated on token listing.', 'telegram', 'https://t.me/obsidian_genesis_ann', 100, 'active', false, false, 0.1000, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_social_media = true AND title = 'Join Official Telegram Channel');

INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding, reward_usd, is_social_media)
SELECT 'Follow Partner X Account', 'Follow our validation nodes partner on X/Twitter to sync telemetry.', 'x', 'https://x.com/obsidian_genesis', 100, 'active', true, false, 0.1000, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_social_media = true AND title = 'Follow Partner X Account');

INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding, reward_usd, is_social_media)
SELECT 'Subscribe to Reddit Community', 'Subscribe to the official Obsidian Genesis Reddit community.', 'x', 'https://reddit.com/r/obsidian_genesis', 100, 'active', true, false, 0.1000, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_social_media = true AND title = 'Subscribe to Reddit Community');

INSERT INTO tasks (title, description, platform, target_url, reward, status, proof_required, is_onboarding, reward_usd, is_social_media)
SELECT 'Join Discord Server', 'Join the Obsidian Genesis community Discord server.', 'x', 'https://discord.gg/obsidian_genesis', 100, 'active', true, false, 0.1000, true
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE is_social_media = true AND title = 'Join Discord Server');
