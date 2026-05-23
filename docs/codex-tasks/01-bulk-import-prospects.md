# Brief 01 — Bulk-import 30 prospects from Obsidian markdown

## Context

Shaq runs a Singapore commercial photography business (@getarchivedsg, brand
"Get Archived") targeting **$10k MRR in retainer clients at $2k/mo each = 5
retainers**. He has a curated outreach list of 30 prospects in an Obsidian
markdown file. We need to bulk-load them into the `leads` table so the Lead
Finder UI (`/leads`) can run diagnoses and DM drafts against them when
outreach kicks off around 2026-06-05.

The Lead Finder is already shipped (Plan 04). It currently requires manual
paste of business name + image URLs per lead. We're pre-seeding the 30
prospects so they're ready in the DB; image URLs + diagnoses will be added
later either manually or via Plan 04B (Apify-driven discovery).

## Source markdown

Path: `~/Documents/Claude/Projects/Get Archived/Business/30_brands_outreach_list.md`

Structure: 5 markdown tables (one per category), each row of shape:

```
| # | Brand | Instagram | Priority | Why They Fit | Outreach Angle |
|---|---|---|---|---|---|
| 1 | **PS.Cafe / PS.Gourmet Group** | @pscafe | 🔴 | <reason> | <angle> |
```

The Brand cell is bold (`**…**`). The Instagram cell starts with `@`. The
Priority cell is one of `🔴` (Hot), `🟡` (Warm), `🟢` (Plant).

## Goal

Write a one-off TypeScript script at `scripts/import-30-prospects.ts` (in the
`ai-council` monorepo root) that parses the markdown and inserts each prospect
as a row in the Supabase `leads` table.

## Schema reference

The `leads` table (from `supabase/migrations/003_leads_crm.sql`):

```sql
create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  business_name      text not null,
  ig_handle          text,
  website            text,
  location           text,
  opportunity_score  numeric(4,2) check (... 0..100),
  status             text not null default 'new' check (status in (
    'new','qualified','contacted','responded','won','lost','archived'
  )),
  diagnosis          jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

## Mapping

| Markdown field | Lead column |
|---|---|
| Brand (strip `**`) | `business_name` |
| Instagram (strip `@`) | `ig_handle` |
| Priority `🔴` | `opportunity_score = 85.0` |
| Priority `🟡` | `opportunity_score = 65.0` |
| Priority `🟢` | `opportunity_score = 45.0` |
| Why They Fit | `diagnosis.why_they_fit` (jsonb sub-field) |
| Outreach Angle | `diagnosis.human_outreach_angle` (jsonb sub-field) |
| n/a | `status = 'new'` |
| n/a | `location = 'Singapore'` |
| n/a | `owner_id = the Supabase user with email limshaquille@gmail.com` |

The `diagnosis` jsonb should look like:
```json
{
  "source": "obsidian_30_prospects_2026_05",
  "why_they_fit": "...",
  "human_outreach_angle": "...",
  "category": "Specialty Coffee & Cafe Groups"   // from the section heading above the table
}
```

## Behavior

- Resolve `owner_id` by querying `auth.users` for `email = 'limshaquille@gmail.com'` (use `SUPABASE_SERVICE_ROLE_KEY`).
- For each prospect:
  - Check if a lead already exists with `(owner_id, business_name)`.
  - If yes, **skip** and log `SKIP existing: <name>`.
  - If no, insert and log `INSERT: <name> · @<handle> · score <N> · <category>`.
- At the end, log a summary: `n inserted, m skipped`.
- Exit code 0 on success, 1 on any unrecoverable error.

## Files to touch

- New: `scripts/import-30-prospects.ts`
- New: `scripts/README.md` (one-paragraph "how to run scripts in this repo")
- New: `scripts/package.json` (only if needed for ts-node / tsx)
- No changes to existing app code

## How to run

Document in the script's top comment + the new scripts/README.md:

```
cd ~/ai-council
SUPABASE_SERVICE_ROLE_KEY=… NEXT_PUBLIC_SUPABASE_URL=… \
  pnpm tsx scripts/import-30-prospects.ts
```

Env vars are already set in `apps/dashboard/.env.local`; the script should
either accept them via CLI env or read from `apps/dashboard/.env.local`
explicitly via `dotenv`.

## Acceptance criteria

1. After running the script once, the `leads` table contains 30 new rows
   owned by Shaq's user, each with `business_name`, `ig_handle`,
   `opportunity_score`, and `diagnosis` populated per the mapping above.
2. Running the script a second time logs 30 `SKIP existing` lines and
   inserts 0 new rows.
3. The 6 🔴 Hot prospects (PS.Cafe, Tiong Bahru Bakery, Elephant Grounds,
   Chagee, Jigger & Pony, Caffe Fernet, Humpback, Fossa, Butter Days,
   Open Farm Community, Grain, Youth Lab SG, Sunday Bedding) all have
   `opportunity_score = 85.0`.
4. Visiting `/leads` in the dashboard shows the 30 prospects sorted by
   opportunity_score desc.

## Constraints

- Do not commit the markdown file contents — only reference its path.
- Do not modify the `leads` table schema. Migration 003 is canonical.
- Do not require any new env vars beyond what `apps/dashboard/.env.local`
  already has.
- The script must be idempotent (rule 2 above).
