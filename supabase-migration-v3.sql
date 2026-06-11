-- ==========================================
-- Migration v3: Mining Sessions, Real-Time Token Settings, Social Tasks
-- ==========================================

-- 1. Add mining tracking columns to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS mining_cycles_completed integer NOT NULL DEFAULT 0;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cooldown_bypassed boolean NOT NULL DEFAULT false;

-- 2. Add Web3 settings to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS token_contract_address text NOT NULL DEFAULT '0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS quickswap_link text NOT NULL DEFAULT 'https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F';
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS owner_wallet text NOT NULL DEFAULT '0x7167C08FD45021c68993057d73f3b35944682635';

UPDATE app_settings SET 
  token_contract_address = '0x2a2c206ac686edd7d5b8cf1cf325de5261cd446f',
  quickswap_link = 'https://dapp.quickswap.exchange/swap?type=best&from=ETH&to=0x2a2C206aC686eDD7D5b8Cf1cf325dE5261cD446F',
  owner_wallet = '0x7167C08FD45021c68993057d73f3b35944682635'
WHERE id = true;

-- 3. Add dynamic reward and social media flag to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reward_usd numeric(10, 4) DEFAULT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_social_media boolean NOT NULL DEFAULT false;

-- 4. Create mining_sessions table
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

-- Indexing for fast queries
CREATE INDEX IF NOT EXISTS idx_mining_sessions_user_claimed ON mining_sessions(user_id, claimed);
CREATE INDEX IF NOT EXISTS idx_mining_sessions_notified ON mining_sessions(notified) WHERE claimed = false;

-- 5. Seed the 4 Social Media tasks (0.1$ reward each)
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
