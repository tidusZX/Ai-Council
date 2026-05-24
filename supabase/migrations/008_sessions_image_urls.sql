-- Migration 008: Image-aware council (Plan 07)
-- Adds an image_urls column to sessions so users can attach photos that
-- each council member sees via Anthropic vision input.
--
-- Non-destructive: existing rows default to '{}' (empty array).

alter table public.sessions
  add column if not exists image_urls text[] not null default '{}';

-- No new RLS policy needed — the column lives in an already-secured row.
