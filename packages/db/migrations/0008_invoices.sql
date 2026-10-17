create table invoices (
  id uuid primary key default gen_random_uuid(),
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  sealed bytea not null,
  amount bigint not null check (amount between 10000 and 1000000000000),
  paid bigint not null default 0 check (paid >= 0),
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'void')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index invoices_vault on invoices (vault, created_at desc);

create table payment_links (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references invoices (id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  version integer not null default 1,
  memo_id text not null unique check (memo_id ~ '^0x[0-9a-f]{64}$'),
  revoked boolean not null default false
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer not null check (log_index >= 0),
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  invoice_id uuid references invoices (id),
  payer text not null check (payer ~ '^0x[0-9a-f]{40}$'),
  amount bigint not null check (amount > 0),
  rail text not null check (rail in ('direct', 'cctp', 'unmatched')),
  state text not null check (state in ('credited', 'extra', 'suggested', 'dismissed')),
  late boolean not null default false,
  at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);
create index payments_invoice on payments (invoice_id);
create index payments_vault_state on payments (vault, state);

create table payment_cursors (
  vault text primary key check (vault ~ '^0x[0-9a-f]{40}$'),
  block bigint not null check (block >= 0),
  updated_at timestamptz not null default now()
);

create table owner_nonces (
  vault text not null,
  nonce text not null,
  deadline timestamptz not null,
  primary key (vault, nonce)
);

alter table deposit_intents add column link_id uuid references payment_links (id);
create index deposit_intents_link on deposit_intents (link_id) where link_id is not null;
