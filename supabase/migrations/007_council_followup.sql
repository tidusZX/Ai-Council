-- Migration 007: Council follow-up dialogue (Plan 06A)
-- Adds threaded follow-up rounds on existing AI Council sessions.
-- Each follow-up question triggers a new round; new messages rows carry
-- the round_number, the members the user addressed, and optionally a
-- pointer to the prior message being responded to.
--
-- Backward compat: existing rows default to round_number=1 with empty
-- addressed_to[], so the migration is non-destructive.

alter table public.messages
  add column if not exists round_number integer not null default 1,
  add column if not exists addressed_to text[] not null default '{}',
  add column if not exists in_reply_to uuid;

-- Self-FK is added separately so the IF NOT EXISTS pattern on the column
-- doesn't conflict with named constraints.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_in_reply_to_fkey'
  ) then
    alter table public.messages
      add constraint messages_in_reply_to_fkey
      foreign key (in_reply_to) references public.messages(id) on delete set null;
  end if;
end$$;

-- Lookup index for grouping messages into rounds for a session.
create index if not exists messages_session_round_idx
  on public.messages(session_id, round_number, created_at);

-- Defensive: backfill any rows where the default didn't take (shouldn't happen
-- with `default 1` above, but harmless if it does).
update public.messages
  set round_number = 1
  where round_number is null;

-- The RLS policies from 001 already scope by session ownership, so we don't
-- need new policies for the new columns — they are within an already-secured
-- row.
