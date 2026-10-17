-- A notification is a duplicate only once it was applied; a claim that never finished can be taken over.
alter table circle_webhook_events add column applied_at timestamptz;
update circle_webhook_events set applied_at = received_at;

-- The card session a suggested payment was attributed to, fixed when it was suggested.
alter table payments add column card_session_id uuid references onramp_sessions (id);
