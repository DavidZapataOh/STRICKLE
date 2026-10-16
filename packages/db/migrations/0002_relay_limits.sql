create table rate_counters (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

create table rate_slots (
  key text primary key,
  claimed_at timestamptz not null
);
