create table users (
  id uuid primary key default gen_random_uuid(),
  home_country char(2) not null,
  locale text not null check (locale in ('en', 'es', 'pt-br')),
  created_at timestamptz not null default now()
);

create table mirror_boxes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('taxes', 'payroll', 'salary', 'operating', 'emergency', 'profit')),
  asset text not null check (asset in ('USDC', 'EURC')),
  balance bytea not null,
  updated_at timestamptz not null default now(),
  unique (user_id, kind, asset)
);

create table receipts (
  id uuid primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  payload bytea not null,
  created_at timestamptz not null default now()
);

create index receipts_user_created_idx on receipts (user_id, created_at);

create table forecasts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  as_of date not null,
  payload bytea not null,
  unique (user_id, as_of)
);

create table agent_state (
  user_id uuid primary key references users (id) on delete cascade,
  version integer not null check (version >= 1),
  state bytea not null,
  updated_at timestamptz not null default now()
);
