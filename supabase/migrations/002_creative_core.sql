-- Migration 002: Creative core
-- Tables for the creator profile, projects, the reference library,
-- the prompt library, and shotlists. Additive only — no changes to
-- sessions or messages from migration 001.

-- ---------------------------------------------------------------------------
-- creators: optional profile layer per auth user. RLS keeps each user
-- scoped to their own row. Not FK'd to other tables (those use owner_id
-- directly against auth.users for simpler RLS).
-- ---------------------------------------------------------------------------
create table if not exists public.creators (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null unique references auth.users(id) on delete cascade,
  display_name  text not null,
  bio           text,
  niches        text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists creators_owner_id_idx on public.creators(owner_id);

-- ---------------------------------------------------------------------------
-- projects: a creative engagement (reel, shoot, campaign, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  type        text not null check (type in ('reel','photo','campaign','video','other')),
  status      text not null default 'planning' check (status in ('planning','shooting','editing','delivered','archived')),
  brief       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects(owner_id);
create index if not exists projects_status_idx on public.projects(status);

-- ---------------------------------------------------------------------------
-- creative_references: saved inspiration / mood / reference items.
-- Renamed from "references" to avoid SQL reserved-word ambiguity.
-- ---------------------------------------------------------------------------
create table if not exists public.creative_references (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  source_url      text,
  source_platform text check (source_platform in ('instagram','tiktok','youtube','pinterest','vimeo','web','other')),
  title           text,
  description     text,
  tags            text[] not null default '{}',
  embedding       vector(1536),
  thumbnail_path  text,
  captured_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists creative_references_owner_id_idx on public.creative_references(owner_id);
create index if not exists creative_references_tags_idx on public.creative_references using gin(tags);
create index if not exists creative_references_embedding_idx
  on public.creative_references using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- prompts: reusable AI prompts (image, video, council, etc.)
-- ---------------------------------------------------------------------------
create table if not exists public.prompts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  body        text not null,
  category    text check (category in ('image','video','motion','council','copy','other')),
  model       text,
  tags        text[] not null default '{}',
  embedding   vector(1536),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prompts_owner_id_idx on public.prompts(owner_id);
create index if not exists prompts_tags_idx on public.prompts using gin(tags);
create index if not exists prompts_embedding_idx
  on public.prompts using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- shotlists: a list of shots tied to a project. Each shot stored as
-- jsonb so the structure can evolve (shot_number, description, lens,
-- duration, reference_ids, etc.) without future schema migrations.
-- ---------------------------------------------------------------------------
create table if not exists public.shotlists (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  shots       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shotlists_project_id_idx on public.shotlists(project_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses public.handle_updated_at from migration 001)
-- ---------------------------------------------------------------------------
create trigger creators_updated_at
  before update on public.creators
  for each row execute procedure public.handle_updated_at();

create trigger projects_updated_at
  before update on public.projects
  for each row execute procedure public.handle_updated_at();

create trigger prompts_updated_at
  before update on public.prompts
  for each row execute procedure public.handle_updated_at();

create trigger shotlists_updated_at
  before update on public.shotlists
  for each row execute procedure public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.creators            enable row level security;
alter table public.projects            enable row level security;
alter table public.creative_references enable row level security;
alter table public.prompts             enable row level security;
alter table public.shotlists           enable row level security;

-- creators: scoped by owner_id
create policy "creators_select" on public.creators
  for select using (auth.uid() = owner_id);
create policy "creators_insert" on public.creators
  for insert with check (auth.uid() = owner_id);
create policy "creators_update" on public.creators
  for update using (auth.uid() = owner_id);
create policy "creators_delete" on public.creators
  for delete using (auth.uid() = owner_id);

-- projects: scoped by owner_id
create policy "projects_select" on public.projects
  for select using (auth.uid() = owner_id);
create policy "projects_insert" on public.projects
  for insert with check (auth.uid() = owner_id);
create policy "projects_update" on public.projects
  for update using (auth.uid() = owner_id);
create policy "projects_delete" on public.projects
  for delete using (auth.uid() = owner_id);

-- creative_references: scoped by owner_id
create policy "creative_references_select" on public.creative_references
  for select using (auth.uid() = owner_id);
create policy "creative_references_insert" on public.creative_references
  for insert with check (auth.uid() = owner_id);
create policy "creative_references_update" on public.creative_references
  for update using (auth.uid() = owner_id);
create policy "creative_references_delete" on public.creative_references
  for delete using (auth.uid() = owner_id);

-- prompts: scoped by owner_id
create policy "prompts_select" on public.prompts
  for select using (auth.uid() = owner_id);
create policy "prompts_insert" on public.prompts
  for insert with check (auth.uid() = owner_id);
create policy "prompts_update" on public.prompts
  for update using (auth.uid() = owner_id);
create policy "prompts_delete" on public.prompts
  for delete using (auth.uid() = owner_id);

-- shotlists: scoped via parent project's owner_id
create policy "shotlists_select" on public.shotlists
  for select using (
    exists (
      select 1 from public.projects
      where projects.id = shotlists.project_id
        and projects.owner_id = auth.uid()
    )
  );
create policy "shotlists_insert" on public.shotlists
  for insert with check (
    exists (
      select 1 from public.projects
      where projects.id = shotlists.project_id
        and projects.owner_id = auth.uid()
    )
  );
create policy "shotlists_update" on public.shotlists
  for update using (
    exists (
      select 1 from public.projects
      where projects.id = shotlists.project_id
        and projects.owner_id = auth.uid()
    )
  );
create policy "shotlists_delete" on public.shotlists
  for delete using (
    exists (
      select 1 from public.projects
      where projects.id = shotlists.project_id
        and projects.owner_id = auth.uid()
    )
  );
