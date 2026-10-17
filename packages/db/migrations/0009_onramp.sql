create table onramp_sessions (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references payment_links (id),
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  circle_session_id text unique,
  status text not null default 'minted' check (status in ('minted', 'settled', 'unresolved')),
  settled_tx text check (settled_tx is null or settled_tx ~ '^0x[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index onramp_sessions_vault on onramp_sessions (vault, created_at desc) where status = 'minted';

create table circle_webhook_events (
  notification_id text primary key,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table payments drop constraint payments_rail_check;
alter table payments add constraint payments_rail_check check (rail in ('direct', 'cctp', 'onramp', 'unmatched'));
