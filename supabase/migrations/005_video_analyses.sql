-- Migration 005: Video analyses
-- The output of the video pipeline (Plan 02): ingest a URL → download via
-- yt-dlp → extract keyframes via ffmpeg → transcribe via OpenAI Whisper →
-- analyze via Claude. One row per analyzed video.
--
-- Status state machine:
--   queued -> downloading -> extracting -> transcribing -> analyzing -> complete
--   (any -> error)
-- Additive only.

create table if not exists public.video_analyses (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  source_url        text not null,
  source_platform   text check (source_platform in ('instagram','tiktok','youtube','vimeo','direct','other')),
  duration_seconds  numeric,
  transcript        text,
  keyframe_paths    jsonb not null default '[]'::jsonb,
  analysis          jsonb,
  raw_metadata      jsonb,
  status            text not null default 'queued'
                    check (status in ('queued','downloading','extracting','transcribing','analyzing','complete','error')),
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists video_analyses_owner_id_idx   on public.video_analyses(owner_id);
create index if not exists video_analyses_status_idx     on public.video_analyses(status);
create index if not exists video_analyses_source_url_idx on public.video_analyses(source_url);

create trigger video_analyses_updated_at
  before update on public.video_analyses
  for each row execute procedure public.handle_updated_at();

alter table public.video_analyses enable row level security;

create policy "video_analyses_select" on public.video_analyses
  for select using (auth.uid() = owner_id);
create policy "video_analyses_insert" on public.video_analyses
  for insert with check (auth.uid() = owner_id);
create policy "video_analyses_update" on public.video_analyses
  for update using (auth.uid() = owner_id);
create policy "video_analyses_delete" on public.video_analyses
  for delete using (auth.uid() = owner_id);
