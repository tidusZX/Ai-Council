-- Migration 006: Storage buckets for video pipeline assets.
-- Keyframes (and later, original videos) get uploaded here from
-- ingestion-service so the dashboard + cross-service workers can read
-- them via Supabase Storage URLs instead of local filesystem paths.
-- Additive — no changes to existing tables.

-- Bucket: video-keyframes (public read; service-role writes only)
-- Paths look like:  <owner_id>/<job_id>/frame-01.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-keyframes',
  'video-keyframes',
  true,
  5242880,         -- 5 MB per frame
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS: anonymous read (the bucket is public; we still want this explicit),
-- writes only via service role.
do $$
begin
  -- Drop conflicting policies if a previous run left them.
  if exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects' and policyname='video_keyframes_read'
  ) then
    drop policy "video_keyframes_read" on storage.objects;
  end if;
end $$;

create policy "video_keyframes_read" on storage.objects
  for select
  to public
  using (bucket_id = 'video-keyframes');
