create table wave_events (
  id bigserial primary key,
  kind text not null check (kind in ('opened', 'incident', 'resolved')),
  tranche integer check (tranche is null or tranche >= 1),
  at timestamptz not null default now(),
  check ((kind = 'opened') = (tranche is not null))
);

create unique index wave_events_opened_once on wave_events (tranche) where kind = 'opened';
