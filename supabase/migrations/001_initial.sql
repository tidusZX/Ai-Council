-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- Sessions table: each council session a user creates
create table if not exists public.sessions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  prompt      text not null,
  status      text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'error')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Messages table: each council member response + chairperson summary
create table if not exists public.messages (
  id           uuid primary key default uuid_generate_v4(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  role         text not null check (role in ('strategist','creative_director','technical_producer','marketing_lead','critic','chairperson')),
  content      text not null default '',
  is_complete  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- pgvector column for semantic search (1536 dims = OpenAI ada-002 / Anthropic compatible)
  embedding    vector(1536)
);

-- Index for vector similarity search
create index if not exists messages_embedding_idx
  on public.messages using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Index for fast session lookups
create index if not exists messages_session_id_idx on public.messages(session_id);
create index if not exists sessions_user_id_idx on public.sessions(user_id);

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute procedure public.handle_updated_at();

create trigger messages_updated_at
  before update on public.messages
  for each row execute procedure public.handle_updated_at();

-- Row Level Security
alter table public.sessions enable row level security;
alter table public.messages enable row level security;

-- Sessions: users can only see/modify their own sessions
create policy "sessions_select" on public.sessions
  for select using (auth.uid() = user_id);

create policy "sessions_insert" on public.sessions
  for insert with check (auth.uid() = user_id);

create policy "sessions_update" on public.sessions
  for update using (auth.uid() = user_id);

create policy "sessions_delete" on public.sessions
  for delete using (auth.uid() = user_id);

-- Messages: users can see messages belonging to their sessions
create policy "messages_select" on public.messages
  for select using (
    exists (
      select 1 from public.sessions
      where sessions.id = messages.session_id
        and sessions.user_id = auth.uid()
    )
  );

create policy "messages_insert" on public.messages
  for insert with check (
    exists (
      select 1 from public.sessions
      where sessions.id = messages.session_id
        and sessions.user_id = auth.uid()
    )
  );

create policy "messages_update" on public.messages
  for update using (
    exists (
      select 1 from public.sessions
      where sessions.id = messages.session_id
        and sessions.user_id = auth.uid()
    )
  );
