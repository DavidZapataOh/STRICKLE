create table metric_snapshots (
  id bigserial primary key,
  network text not null check (network in ('testnet', 'mainnet')),
  taken_at timestamptz not null default now(),
  as_of_block bigint not null,
  payload jsonb not null,
  state jsonb not null
);

create index metric_snapshots_latest_idx on metric_snapshots (network, id desc);
