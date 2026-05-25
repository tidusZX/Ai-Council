-- Migration 011: leads → Notion link
-- Adds a nullable notion_page_id column so we can dedup Notion pushes
-- and jump from a lead row to the corresponding Notion page.
-- Additive only.

alter table public.leads
  add column if not exists notion_page_id text;

create index if not exists leads_notion_page_id_idx
  on public.leads(notion_page_id)
  where notion_page_id is not null;
