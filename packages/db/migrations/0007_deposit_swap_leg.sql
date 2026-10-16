alter table deposit_intents
  add column input_token text not null default 'USDC' check (input_token in ('USDC', 'USDT')),
  add column swap_tx text check (swap_tx is null or swap_tx ~ '^0x[0-9a-fA-F]{64}$'),
  add column swap_out bigint check (swap_out is null or swap_out > 0);

alter table deposit_intents drop constraint deposit_intents_status_check;
alter table deposit_intents add constraint deposit_intents_status_check check (status in ('created', 'swapped', 'burned', 'arrived', 'failed'));

create unique index deposit_intents_swap_once on deposit_intents (swap_tx) where swap_tx is not null;
