-- Migration 004: Council outputs & reports
-- council_outputs decouples *structured* artifacts (shotlists, critiques,
-- strategies, analyses) from the freeform `messages` table so different
-- services and council members can emit typed payloads without losing
-- the flexibility of jsonb.
-- reports holds generated periodic outputs (weekly trends, lead pulse, etc.).
-- Additive only.

-- ---------------------------------------------------------------------------
-- council_outputs: structured artifacts produced by the council, scoped
-- to a session and optionally tied to a project.
-- ---------------------------------------------------------------------------
create table if not exists public.council_outputs (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  kind        text not null check (kind in (
    'shotlist',
    'critique',
    'strategy',
    'analysis',
    'image_prompt_pack',
    'motion_prompt_pack',
    'caption_pack',
    'posting_plan',
    'other'
  )),
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists council_outputs_session_id_idx on public.council_outputs(session_id);
create index if not exists council_outputs_project_id_idx on public.council_outputs(project_id);
create index if not exists council_outputs_kind_idx       on public.council_outputs(kind);

-- ---------------------------------------------------------------------------
-- reports: generated periodic outputs
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('weekly_trends','lead_pulse','content_audit','revenue_pulse','other')),
  generated_at  timestamptz not null default now(),
  payload       jsonb not null,
  created_at    timestamptz not null default now()
);

create index if not exists reports_owner_id_idx     on public.reports(owner_id);
create index if not exists reports_kind_idx         on public.reports(kind);
create index if not exists reports_generated_at_idx on public.reports(generated_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.council_outputs enable row level security;
alter table public.reports         enable row level security;

-- council_outputs: scoped via parent session's user_id
create policy "council_outputs_select" on public.council_outputs
  for select using (
    exists (
      select 1 from public.sessions
      where sessions.id = council_outputs.session_id
        and sessions.user_id = auth.uid()
    )
  );
create policy "council_outputs_insert" on public.council_outputs
  for insert with check (
    exists (
      select 1 from public.sessions
      where sessions.id = council_outputs.session_id
        and sessions.user_id = auth.uid()
    )
  );
create policy "council_outputs_update" on public.council_outputs
  for update using (
    exists (
      select 1 from public.sessions
      where sessions.id = council_outputs.session_id
        and sessions.user_id = auth.uid()
    )
  );
create policy "council_outputs_delete" on public.council_outputs
  for delete using (
    exists (
      select 1 from public.sessions
      where sessions.id = council_outputs.session_id
        and sessions.user_id = auth.uid()
    )
  );

-- reports: scoped by owner_id
create policy "reports_select" on public.reports
  for select using (auth.uid() = owner_id);
create policy "reports_insert" on public.reports
  for insert with check (auth.uid() = owner_id);
create policy "reports_update" on public.reports
  for update using (auth.uid() = owner_id);
create policy "reports_delete" on public.reports
  for delete using (auth.uid() = owner_id);
