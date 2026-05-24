# Plan 04B — Apify Lead Discovery

## Context

[Plan 04 (Lead Finder)](04-lead-finder.md) shipped phases 1–5 on 2026-05-22. Today's funnel state:

- 30 manually-curated prospects seeded into `leads` (via `scripts/import-30-prospects.ts` on 2026-05-24, source = `obsidian_30_prospects_2026_05`).
- `/leads` UI lets Shaq diagnose any business by pasting its name + IG image URLs.
- `analysis-service /diagnose-lead` runs Claude vision over the images, writes the diagnosis JSON.
- Outreach drafting (Plan 04 Phase 5) generates personalized DMs from the diagnosis.

**The bottleneck**: every lead is hand-added. To hit `$10k MRR = 5 retainers × $2k/mo`, the funnel needs ~80 candidates in flow (~6% close rate on cold outbound). Manual curation doesn't scale past the existing 30.

[Apify](https://apify.com) is a SaaS that runs pre-built scrapers (Actors) against websites. This plan integrates two Actors to make lead discovery continuous:

1. **Instagram Profile Scraper** — given a handle, returns ~12 recent post image URLs ready for `/diagnose-lead`.
2. **Google Maps Places Scraper** — given a category + location filter, returns Singapore businesses with names, websites, and (often) social links.

Together they replace the "manually curate → paste IG URLs → diagnose" loop with "feed criteria → wake up to fresh diagnosed leads".

## Timing

**Queued for 2026-06-05**, alongside the outreach kick-off. Earlier is wasted — discovery is only valuable when you're actually DM'ing. Per the `project_outreach_sequencing` memory: 1–2 weeks of consistent posting first so the target IG account looks fresh when they click through. Discovery + outreach activate together.

## North-star target

Same as Plan 04: **5 retainers × $2k/mo = $10k MRR.** ~80 lead candidates in funnel. Today: 30 in the table, all manual. Plan 04B target after 4 weeks live: 100+ leads in the table, 60+ with diagnoses, with `discovery_source` distribution showing Apify-discovered leads outnumbering manual 3:1.

---

## Goals

1. **Bulk-diagnose by IG handle**: paste a list of handles → Apify fetches recent posts → each handle becomes a `leads` row with `diagnosis` already populated.
2. **Category-driven discovery**: pick a Singapore category (e.g. "specialty coffee", "fine dining") and a min review count → get a list of candidate businesses with IG handles extracted.
3. **Distinguish auto-discovered from human-curated** via `leads.discovery_source` + `leads.discovery_metadata` so we can A/B test conversion rates.
4. **Cost-bounded**: hard cap on Apify spend per run (env var). MVP target: <$5/month at expected volume.
5. **Ban-safe**: never use Shaq's own IG account credentials; Apify proxies through its own IP pool.

## Non-goals

- **Real-time discovery** — discovery runs are async (2–10 min). User clicks "Discover" and walks away; refresh later.
- **No queue layer** — synchronous polling from the browser, with a max wait of ~10 min. Future cron-based discovery is its own plan (call it 04C if it happens).
- **No automated outreach** — discovery produces leads with diagnoses; the user still manually triggers Plan 04 Phase 5 outreach drafting and sends DMs.
- **No web scraping outside Apify** — we don't build our own scrapers; if Apify doesn't have an Actor for it, we don't fetch it.
- **No image storage** — IG image URLs are stored as-is (CDN-hosted by IG). If they expire (~24h on signed URLs), the diagnosis JSON stays but the images don't render in UI. Acceptable for MVP.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  Browser /leads/discover                                      │
│  - Form: handles (textarea) OR category + min_reviews         │
│  - Submit → POST /api/leads/discover                          │
│  - Display run ID + a "Refresh status" button                 │
│  - On completion: list of new leads w/ diagnoses              │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  POST /api/leads/discover                                     │
│  - Auth check                                                 │
│  - Route by mode: 'ig_handles' or 'maps_category'             │
│  - Trigger Apify Actor run via @apify/client                  │
│  - Persist a discovery_runs row (new table)                   │
│  - Return { runId, apifyRunId, status: 'queued' }             │
└───────────────────────────────────────────────────────────────┘
                          │ (async — Apify runs 2–10 min)
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  GET /api/leads/discover/[runId]                              │
│  - Poll Apify for status                                      │
│  - When SUCCEEDED: fetch dataset, transform rows              │
│  - For each row: ensure-not-duplicate, insert leads row,      │
│    optionally trigger analysis-service /diagnose-lead         │
│  - Mark discovery_runs row complete                           │
│  - Return { status, newLeads, errors }                        │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  leads + outreach_logs (existing)
                  discovery_runs (new)
```

---

## Schema changes (migration 009)

```sql
-- Add provenance + raw payload to existing leads table.
alter table public.leads
  add column if not exists discovery_source text,
  add column if not exists discovery_metadata jsonb not null default '{}'::jsonb;

create index if not exists leads_discovery_source_idx on public.leads(discovery_source);

-- Track each Apify discovery run so the UI can show status + history.
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
  error_message   text,
  cost_usd        numeric(8,4),
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists discovery_runs_owner_idx on public.discovery_runs(owner_id);
create index if not exists discovery_runs_status_idx on public.discovery_runs(status);

alter table public.discovery_runs enable row level security;
create policy "discovery_runs_select" on public.discovery_runs
  for select using (auth.uid() = owner_id);
create policy "discovery_runs_insert" on public.discovery_runs
  for insert with check (auth.uid() = owner_id);
create policy "discovery_runs_update" on public.discovery_runs
  for update using (auth.uid() = owner_id);
```

Regenerate `packages/database-types/src/database.ts` after applying (or hand-patch since the local Notion key issue makes `supabase gen types --linked` flaky).

---

## API surface

### `POST /api/leads/discover`

Two modes; the body shape switches on `mode`.

**Mode A — IG handles (Phase 1 MVP)**
```ts
{
  mode: 'ig_handles',
  igHandles: string[]  // e.g. ['pscafe', 'tiongbahrubakery'], min 1, max 30
  postsPerHandle?: number = 12  // 1..24
  runDiagnosis?: boolean = true
}
```

**Mode B — Maps category (Phase 2)**
```ts
{
  mode: 'maps_category',
  category: string  // e.g. 'specialty coffee shop'
  location: string  // default 'Singapore'
  minReviews?: number = 50
  maxResults?: number = 30
  autoExtractIg?: boolean = true   // try website-crawl to find IG handle
  runDiagnosis?: boolean = true
}
```

Returns `{ runId: uuid, apifyRunId: string, status: 'queued' }`.

### `GET /api/leads/discover/[runId]`

Polls Apify, transforms results when ready, returns:
```ts
{
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'partial',
  apifyRunId: string,
  newLeads: { id: uuid, business_name: string, ig_handle: string }[],
  skipped: { ig_handle: string, reason: 'already_exists' | 'no_posts' | 'private' }[],
  costUsd?: number,
  errorMessage?: string,
}
```

### `GET /api/leads/discover/runs`

Lists this owner's discovery runs with status. Used by the `/leads/discover` page to show history.

---

## Apify Actors (specifics)

### `apify/instagram-profile-scraper`
- Input: `{ usernames: string[], resultsLimit: number }`
- Output (per item): `{ username, fullName, biography, postsCount, followersCount, latestPosts: [{ url, displayUrl, caption, timestamp, type, ... }] }`
- Cost: ~$0.5 per 100 profiles
- Time: ~2–4 minutes for 30 handles

### `apify/google-maps-extractor` (or `compass/google-maps-scraper`)
- Input: `{ searchStringsArray: string[], maxCrawledPlacesPerSearch: number, locationQuery: string }`
- Output (per item): `{ title, address, totalScore, reviewsCount, url, website, phone, openingHours, ... }`
- Cost: ~$0.7 per 1000 places
- Time: ~5–10 minutes for 30 places

### `apify/website-content-crawler` (Phase 2 only)
- Used to extract IG handles from business websites when Maps doesn't have them.
- Limit to 1 page per website (homepage) to keep cost minimal.

### What about IG Video Scraper?
- Mentioned in roadmap as fallback for the Video Analyzer's IG-gated content.
- Out of scope for 04B; deal with in Codex task 04 (IG cookies for yt-dlp) instead.

---

## Transform logic — turn Apify rows into `leads`

### From `instagram-profile-scraper` output:
```ts
{
  business_name: item.fullName ?? item.username,
  ig_handle: item.username,
  location: extractFromBio(item.biography) ?? 'Singapore',
  opportunity_score: null,  // populated after diagnosis
  status: 'new',
  diagnosis: {},  // populated after /diagnose-lead runs
  discovery_source: `apify_ig_scraper_${YYYY_MM}`,
  discovery_metadata: {
    actor: 'apify/instagram-profile-scraper',
    apify_run_id: runId,
    apify_item_id: item.id,
    followers_count: item.followersCount,
    posts_count: item.postsCount,
    bio: item.biography,
    latest_post_image_urls: item.latestPosts.slice(0, 12).map(p => p.displayUrl),
  }
}
```

Then for each lead with `latest_post_image_urls`, POST to analysis-service `/diagnose-lead` with those URLs. Standard existing flow.

### From `google-maps-extractor` output:
```ts
{
  business_name: item.title,
  ig_handle: null,  // unless autoExtractIg ran and found one
  website: item.website,
  location: item.address ?? 'Singapore',
  opportunity_score: null,
  status: 'new',
  diagnosis: {},
  discovery_source: `apify_maps_${YYYY_MM}`,
  discovery_metadata: {
    actor: 'apify/google-maps-extractor',
    google_review_count: item.reviewsCount,
    google_rating: item.totalScore,
    address: item.address,
    phone: item.phone,
    google_maps_url: item.url,
  }
}
```

For Maps leads: if `autoExtractIg` was set, queue a follow-up website-crawler run per lead to extract the IG handle, then trigger an `ig_handles` discovery for those.

---

## Dedup logic

Before inserting a lead, query:
```sql
SELECT id FROM leads
WHERE owner_id = $1
  AND (
    (ig_handle IS NOT NULL AND ig_handle = $2)
    OR (business_name ILIKE $3)
  )
LIMIT 1
```

If hit: skip, add to `skipped[]` with reason `'already_exists'`. Add the skipped lead's id to the run record anyway for audit.

---

## Env vars

| Name | Scope | Purpose |
|---|---|---|
| `APIFY_API_TOKEN` | Vercel | Apify auth — required |
| `APIFY_MAX_RUN_COST_USD` | Vercel | Per-run hard cap. Default `2.0` |
| `APIFY_DEFAULT_TIMEOUT_S` | Vercel | Per-run timeout. Default `900` (15 min) |
| `APIFY_PROXY_GROUP` | Vercel | Optional — `RESIDENTIAL` for higher IG anti-ban tier (costs more) |

---

## Cost model

Realistic monthly volumes (post-MVP, 4 weeks in):

| Workload | Volume | Cost |
|---|---|---|
| IG profile scrapes | 200/month | ~$1.00 |
| Maps category runs | 4 × 50 places | ~$0.14 |
| Website crawls | 50/month | ~$0.50 |
| Claude vision (diagnose-lead) | 200 leads × 6 images × $0.005 | ~$6.00 |
| **Total Apify + AI per month** | | **~$8/month** |
| Apify base subscription | $49/month free tier covers this | $0 |

At 5× scale (1000 leads/month): ~$40 Apify + AI. Still under the $49 free tier compute. Bump to Apify Starter ($49/month + paid usage) only when we exceed compute units.

---

## Ban-risk + safety

- **Never use Shaq's IG account credentials.** Apify's IG actor scrapes public profile data only — no auth required for public posts.
- **Apify rotates IPs by default.** Optional `APIFY_PROXY_GROUP=RESIDENTIAL` upgrades to harder-to-block IPs (costs ~2x).
- **Rate-cap profile scrapes** to 50/day via the route's max-handles check. Burst scraping increases ban risk.
- **Apify Actors are sandboxed** — they run in Apify's infrastructure, not on Vercel. If Apify gets a soft block from IG, it's Apify's problem to recycle IPs. Shaq's account is never exposed.
- **No write actions** — discovery is read-only against IG/Maps. We never DM, follow, comment, or otherwise interact via Apify.

---

## UI shape — `/leads/discover`

```
┌───────────────────────────────────────────────────────────────┐
│ Leads / Discover                                              │
├───────────────────────────────────────────────────────────────┤
│ Mode: ( ● IG handles  )  ( ○ Maps category )                 │
│                                                               │
│ IG handles (one per line, max 30):                           │
│ ┌───────────────────────────────────────────────────────┐    │
│ │ pscafe                                                │    │
│ │ tiongbahrubakery                                      │    │
│ │ ...                                                   │    │
│ └───────────────────────────────────────────────────────┘    │
│                                                               │
│ [ ] Run Claude diagnosis on each (recommended)               │
│                                                               │
│ Estimated cost: $0.30 · ~3 min                                │
│ [ Discover ]                                                  │
├───────────────────────────────────────────────────────────────┤
│ Recent runs                                                   │
│ ─ 2026-06-05 14:23 · IG · 12 handles · ✅ done · 12 new       │
│ ─ 2026-06-05 11:10 · Maps · "specialty coffee" · 🟡 running   │
└───────────────────────────────────────────────────────────────┘
```

On submit, redirect to `/leads/discover/[runId]` which polls every 5s and shows progress + new leads as they land.

---

## Phases (estimated)

1. **Phase 1 — IG handles MVP** (~2 hrs)
   - Migration 009 applied
   - `/api/leads/discover` (ig_handles mode only)
   - `/api/leads/discover/[runId]` poll endpoint
   - `/leads/discover` page w/ handle-list form
   - Background trigger to `/diagnose-lead` for each new lead
2. **Phase 2 — Maps category** (~2 hrs)
   - Add `maps_category` mode to discover route
   - Add website-crawler chained call for IG extraction
   - Update UI with mode toggle
3. **Phase 3 — Run history UI** (~1 hr)
   - `/leads/discover/runs` list
   - Each run links to its lead detail rows
4. **Phase 4 — Cost + safety guardrails** (~30 min)
   - `APIFY_MAX_RUN_COST_USD` check before triggering
   - Daily rate limit enforcement at the route layer
5. **Smoke test against live Apify** (~30 min, ~$0.50 cost)
   - One real IG-handles run with 5 known SG businesses
   - One real Maps run with "specialty coffee"
   - Verify diagnoses populate; verify dedup; verify cost reporting

Total: **~6 hours**. MVP (Phase 1 only) is shippable in ~2 hrs.

---

## Acceptance criteria

1. Migration 009 applies cleanly. `database-types` reflects new columns + table.
2. `POST /api/leads/discover` with 3 valid IG handles returns `{ runId, status: 'queued' }` within 1s.
3. `GET /api/leads/discover/[runId]` polled every 5s eventually returns `status: 'succeeded'` with 1-3 `newLeads[]` (less than 3 if dedup'd against the 30-prospect seed).
4. Each new lead has `diagnosis.brand_consistency.score` populated (proves the `/diagnose-lead` chain fired).
5. Re-running the same handle list returns 0 newLeads (dedup works).
6. Cost reported in `discovery_runs.cost_usd` matches Apify's billing dashboard within $0.05.
7. `/leads/discover/runs` lists past runs with status and lead counts.

---

## Risk + mitigations

- **IG image URLs expire** — IG's signed URLs typically last 24–48h. After that, the stored image_urls in `diagnosis_metadata.latest_post_image_urls` return 403. Mitigation: the `diagnosis` JSON (which has the analysis text) persists. If we need re-rendering later, store the actual image bytes to Supabase Storage. Defer to a v2.
- **Apify Actor schema changes** — Apify Actors are versioned but the maintainer can ship breaking changes. Mitigation: pin to a specific Actor version in the route (`actorId@version`).
- **Quotas hit during outreach push** — if Shaq goes from 0 to 200 leads in a day, the diagnosis chain costs ~$6 in vision. Mitigation: `APIFY_MAX_RUN_COST_USD` per run + a session-level confirm if cost > $3.
- **Bad data quality from Maps** — Google Maps category strings are fuzzy ("café" vs "cafe" vs "coffee shop"). Mitigation: run a small smoke set first; tune the search strings; combine multiple categories.

---

## What this unlocks vs doesn't

Unlocks:
- Continuous funnel growth without manual list-curating.
- A/B between Apify-discovered and human-curated leads (via `discovery_source`).
- Foundation for an eventual scheduled discovery (cron weekly).

Doesn't unlock:
- Auto-outreach — still manual per Plan 04 Phase 5.
- Lead enrichment from non-IG sources (LinkedIn, Crunchbase) — not in scope.
- Disclosed brand intel (revenue, headcount) — Apify doesn't have it; consider a SimilarWeb/Clearbit integration later if needed.

---

## Plans / changelog

- Queued in `roadmap.md` since 2026-05-22.
- Drafted as a spec 2026-05-24 — ready to implement in ~2 hrs for the MVP.
- Implementation target: ~2026-06-05 alongside outreach kick-off.
