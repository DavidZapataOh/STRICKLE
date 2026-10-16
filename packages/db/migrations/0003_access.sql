create table invites (
  id bigserial primary key,
  code_hash text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create index invites_open_idx on invites (created_at) where redeemed_at is null;

create table access_sessions (
  sid text primary key,
  invite_id bigint not null references invites (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index access_sessions_invite_idx on access_sessions (invite_id);
