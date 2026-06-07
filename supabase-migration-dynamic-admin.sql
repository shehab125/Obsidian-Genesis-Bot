alter table app_users
  add column if not exists balance_pending integer not null default 0,
  add column if not exists balance_withdrawable integer not null default 0,
  add column if not exists purchase_verified boolean not null default false,
  add column if not exists purchase_verified_at timestamptz;

alter table app_settings
  add column if not exists token_usd_price numeric(12, 6) not null default 0.001;

update app_users
set balance_pending = balance
where balance_pending = 0 and balance > 0 and purchase_verified = false;

update app_users
set balance_withdrawable = balance
where balance_withdrawable = 0 and balance > 0 and purchase_verified = true;

create table if not exists app_settings (
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
  purchase_condition_enabled
)
values (true, 500, 3.00, true)
on conflict (id) do nothing;

create table if not exists purchase_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  wallet_address text not null,
  proof_url text not null,
  status submission_status not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_verification_requests_status
  on purchase_verification_requests(status);
