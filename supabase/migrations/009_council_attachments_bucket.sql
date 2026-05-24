-- Migration 009: Council attachments storage bucket (Plan 8)
-- Lets users drag-drop photos into /sessions/new and /voice instead of
-- only pasting public URLs. Same pattern as the video-keyframes bucket
-- from migration 006.
--
-- Paths look like: <owner_id>/<random>/<filename>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'council-attachments',
  'council-attachments',
  true,                                          -- public read so Anthropic vision can fetch
  10485760,                                      -- 10 MB cap per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS: anyone can read (the bucket is public), writes only via service role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'council_attachments_public_read'
  ) then
    create policy "council_attachments_public_read"
      on storage.objects for select
      using (bucket_id = 'council-attachments');
  end if;
end$$;
