create type task_platform as enum ('telegram', 'x');
create type task_status as enum ('active', 'archived');
create type submission_status as enum ('pending', 'approved', 'rejected');
create type withdrawal_status as enum ('pending', 'paid', 'rejected');

create table app_users (
  id uuid primary key default gen_random_uuid(),
  telegram_id text unique not null,
  username text,
  display_name text not null,
  balance integer not null default 0,
  balance_pending integer not null default 0,
  balance_withdrawable integer not null default 0,
  purchase_verified boolean not null default false,
  purchase_verified_at timestamptz,
  frozen boolean not null default false,
  created_at timestamptz not null default now()
);

create table app_settings (
  id boolean primary key default true,
  minimum_withdrawal_points integer not null default 500,
  required_purchase_usd numeric(10, 2) not null default 3.00,
  purchase_condition_enabled boolean not null default true,
  token_usd_price numeric(12, 6) not null default 0.001,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = true)
);

insert into app_settings (
  id,
  minimum_withdrawal_points,
  required_purchase_usd,
  purchase_condition_enabled,
  token_usd_price
)
values (true, 500, 3.00, true, 0.001);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  platform task_platform not null,
  target_url text not null,
  reward integer not null check (reward > 0),
  status task_status not null default 'active',
  proof_required boolean not null default false,
  created_at timestamptz not null default now()
);

create table task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  reward integer not null check (reward > 0),
  created_at timestamptz not null default now(),
  unique (user_id, task_id)
);

create table review_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  proof_url text not null,
  note text,
  status submission_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  amount integer not null check (amount > 0),
  wallet_address text not null,
  status withdrawal_status not null default 'pending',
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table purchase_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  wallet_address text not null,
  proof_url text not null,
  status submission_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_task_completions_user_id on task_completions(user_id);
create index idx_review_submissions_status on review_submissions(status);
create index idx_withdrawal_requests_status on withdrawal_requests(status);
create index idx_purchase_verification_requests_status on purchase_verification_requests(status);
