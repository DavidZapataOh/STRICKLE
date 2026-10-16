create table deposit_intents (
  id uuid primary key default gen_random_uuid(),
  vault text not null check (vault ~ '^0x[0-9a-fA-F]{40}$'),
  source_chain text not null check (length(source_chain) between 1 and 40),
  source_address text not null check (source_address ~ '^0x[0-9a-fA-F]{40}$'),
  amount bigint not null check (amount > 0),
  speed text not null check (speed in ('fast', 'slow')),
  fee_mode text not null check (fee_mode in ('source', 'destination')),
  intent text not null default 'income' check (intent in ('income', 'own', 'unsure')),
  status text not null default 'created' check (status in ('created', 'burned', 'arrived', 'failed')),
  burn_tx text check (burn_tx is null or burn_tx ~ '^0x[0-9a-fA-F]{64}$'),
  forward_tx text check (forward_tx is null or forward_tx ~ '^0x[0-9a-fA-F]{64}$'),
  received bigint check (received is null or received > 0),
  failure text check (failure is null or length(failure) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deposit_intents_vault on deposit_intents (vault, created_at desc);
create unique index deposit_intents_burn_once on deposit_intents (burn_tx) where burn_tx is not null;
