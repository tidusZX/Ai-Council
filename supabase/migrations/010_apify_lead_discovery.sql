-- Migration 010: Apify lead discovery (Plan 04B Phase 1)
-- Adds provenance to leads and a tracker for async Apify Actor runs.
-- Additive only.

-- ---------------------------------------------------------------------------
-- leads: add discovery_source + discovery_metadata.
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists discovery_source text,
  add column if not exists discovery_metadata jsonb not null default '{}'::jsonb;

create index if not exists leads_discovery_source_idx
  on public.leads(discovery_source);

-- ---------------------------------------------------------------------------
-- discovery_runs: each Apify Actor run we trigger.
--   queued    : POST hit; Apify call about to fire
--   running   : Apify reports IN_PROGRESS / READY
--   succeeded : Apify reports SUCCEEDED and we've ingested the dataset
--   failed    : Apify reports failed OR our ingest threw
--   partial   : ingest succeeded but some leads errored mid-insert
-- ---------------------------------------------------------------------------
create table if not exists public.discovery_runs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  mode            text not null check (mode in ('ig_handles', 'maps_category', 'website_crawl')),
  input           jsonb not null,
  apify_actor_id  text not null,
  apify_run_id    text,
  status          text not null default 'queued' check (status in (
    'queued', 'running', 'succeeded', 'failed', 'partial'
  )),
  lead_ids        uuid[] not null default '{}',
  skipped         jsonb not null default '[]'::jsonb,
  error_message   text,
  cost_usd        numeric(8,4),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists discovery_runs_owner_idx
  on public.discovery_runs(owner_id, created_at desc);
create index if not exists discovery_runs_status_idx
  on public.discovery_runs(status);

alter table public.discovery_runs enable row level security;

create policy "discovery_runs_select" on public.discovery_runs
  for select using (auth.uid() = owner_id);
create policy "discovery_runs_insert" on public.discovery_runs
  for insert with check (auth.uid() = owner_id);
create policy "discovery_runs_update" on public.discovery_runs
  for update using (auth.uid() = owner_id);
create policy "discovery_runs_delete" on public.discovery_runs
  for delete using (auth.uid() = owner_id);
