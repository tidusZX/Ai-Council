# Plan 02 — Video Pipeline (Lean MVP)

## Context

The foundation (Plan 01, merged) gives us a working monorepo with two empty service stubs — `ingestion-service` and `analysis-service` — exposing only `/health`. This plan fills them in so Shaq can **paste a viral TikTok / Instagram / YouTube URL and get back a structured analysis of why the video works**, stored permanently in Supabase and viewable from the dashboard.

The chosen scope (per discussion) is the **lean MVP**:

> ingest → transcribe → keyframes → Claude analysis

Visual embeddings (CLIP/SigLIP), scene detection (PySceneDetect), background workers/queues, and Supabase Storage are explicitly deferred to a v2 plan. Cloud deployment to Zo is its own plan (Plan 03 candidate).

Everything runs **locally on Shaq's Mac** at the end of this plan. The pipeline is HTTP-driven (synchronous chain), not queue-driven.

---

## Goals

1. `ingestion-service` accepts a URL, downloads the video via yt-dlp, extracts ~12 keyframes via ffmpeg, persists files to local disk.
2. `analysis-service` accepts a job, transcribes the video via the OpenAI Whisper API, sends transcript + sampled keyframes to Claude for structured analysis.
3. Results land in a new Supabase table `video_analyses` (migration 005), scoped by `owner_id` with full RLS.
4. The dashboard gets one new route — **`/references/analyze`** — with a URL input form and a result view showing transcript, keyframes, and analysis cards.
5. Everything verifiable end-to-end with a real TikTok / IG / YT URL on Shaq's Mac.

## Non-goals (deferred)

- CLIP / SigLIP visual embeddings (deferred — v2)
- Scene detection / shot-level segmentation (v2)
- Background worker / queue (v2 — for MVP we run synchronously)
- Supabase Storage upload of video + keyframes (handled in Plan 03 — Zo deployment)
- Auto-linking analyzed videos to `creative_references` (v2)
- Batch ingestion from a list of URLs (v2)
- Mobile / responsive optimization of the new dashboard page (acceptable rough on desktop only)

---

## Architecture

```
┌──────────────────────────────┐
│ apps/dashboard               │
│  /references/analyze         │
│  └─ POST URL ────────────────┐
└──────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────┐
│ ingestion-service (:3001)            │
│  POST /jobs { url }                  │
│   1. Insert video_analyses row       │
│      status=downloading              │
│   2. yt-dlp download → /tmp/...      │
│   3. ffmpeg extract 12 keyframes     │
│   4. Update row status=transcribing  │
│   5. POST /process to analysis-svc ──┐
└──────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────┐
│ analysis-service (:3002)             │
│  POST /process { job_id, paths }     │
│   1. Whisper transcribe (OpenAI API) │
│   2. Update row status=analyzing,    │
│      transcript=...                  │
│   3. Build Claude prompt with        │
│      transcript + base64 keyframes   │
│   4. Anthropic SDK call (vision)     │
│   5. Update row status=complete,     │
│      analysis={...}                  │
└──────────────────────────────────────┘
                                       │
                                       ▼
                              Supabase Postgres
                              video_analyses
```

Why two services even for MVP:
- Clean separation of concerns: I/O work (yt-dlp + ffmpeg) is CPU/disk-heavy; AI work (Whisper + Claude) is network/latency-heavy.
- When we move to Zo (Plan 03), each can scale independently.
- The HTTP boundary already exists, so the queue refactor (v2) is a swap, not a rewrite.

---

## Stack & prerequisites

### System CLIs to install (one time)

```bash
brew install ffmpeg yt-dlp
```

### Node packages added to services

| Package | Where | Why |
|---|---|---|
| `yt-dlp-wrap` | ingestion-service | Programmatic yt-dlp wrapper |
| `fluent-ffmpeg` + `@types/fluent-ffmpeg` | ingestion-service | Programmatic ffmpeg |
| `zod` | both | Request body validation |
| `openai` | analysis-service | Whisper API |
| `@anthropic-ai/sdk` | analysis-service | Claude vision call |
| `@shaq-os/supabase-client` (already exists) | both | DB writes |
| `@shaq-os/database-types` (already exists) | both | Types |

### Env vars (per-service `.env.local`)

`services/ingestion-service/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
INGESTION_TMP_DIR=/tmp/shaq-os/ingestion
ANALYSIS_SERVICE_URL=http://localhost:3002
```

`services/analysis-service/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...           # New — Shaq needs to add this
ANTHROPIC_API_KEY=sk-ant-...     # Already in dashboard env
```

> **Action item for Shaq**: create an OpenAI API key at platform.openai.com (or reuse if you have one). Budget: a 60-second reel = $0.006 to transcribe.

---

## Supabase schema (migration 005)

```sql
-- 005_video_analyses.sql
create table public.video_analyses (
  id                uuid primary key default uuid_generate_v4(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  source_url        text not null,
  source_platform   text check (source_platform in ('instagram','tiktok','youtube','vimeo','direct','other')),
  duration_seconds  numeric,
  transcript        text,
  keyframe_paths    jsonb not null default '[]',
  analysis          jsonb,            -- { hook, structure, pacing, shot_list[], hypothesized_why_it_works, ... }
  raw_metadata      jsonb,            -- yt-dlp output (title, uploader, view_count, etc.)
  status            text not null default 'queued'
                    check (status in ('queued','downloading','extracting','transcribing','analyzing','complete','error')),
  error_message     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index video_analyses_owner_id_idx   on public.video_analyses(owner_id);
create index video_analyses_status_idx     on public.video_analyses(status);
create index video_analyses_source_url_idx on public.video_analyses(source_url);

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
```

> Migrations 002, 003, 004 are still unapplied (deferred from Plan 01). This plan applies **002 through 005 together** in one `supabase db push`. All additive, all safe.

---

## API contracts

### `ingestion-service` (port 3001)

**`POST /jobs`** — kick off a job

Request:
```json
{ "url": "https://www.tiktok.com/@x/video/123", "owner_id": "<auth user uuid>" }
```

Response (immediate, before analysis completes):
```json
{ "job_id": "<uuid>", "status": "downloading" }
```

The service writes the row, downloads the video, extracts keyframes, then `await fetch(ANALYSIS_SERVICE_URL + '/process', ...)` and waits for it to finish. So the caller's HTTP request stays open for the full pipeline (~30–90s depending on video length and Claude latency).

Optional `GET /jobs/:id` proxies a DB read for status polling, but the dashboard reads from Supabase directly in MVP.

### `analysis-service` (port 3002)

**`POST /process`** — transcribe + analyze

Request:
```json
{
  "job_id": "<uuid>",
  "video_path": "/tmp/shaq-os/ingestion/<uuid>/video.mp4",
  "keyframe_paths": ["/tmp/.../frame-01.jpg", ...]
}
```

Response:
```json
{ "job_id": "<uuid>", "status": "complete" }
```

Internally writes transcript + analysis JSON to the `video_analyses` row.

### Claude analysis prompt shape (analysis-service)

Single Anthropic call using `claude-sonnet-4-5` (or whatever the current default in the council is) with vision blocks:

```
System: You are a viral content analyst...
User: [transcript text]
       [image: frame 01]
       [image: frame 04]
       [image: frame 07]
       [image: frame 10]
       
       Return JSON with these fields:
         hook (first 3 seconds, what it does)
         structure (act breakdown)
         pacing (cuts per second, energy curve)
         shot_list ([{shot_n, description, est_duration_s}])
         captions_used (what they say + when)
         music_and_audio (notes if discernible)
         hypothesized_why_it_works (3-5 bullets)
         risks_if_replicated (what could fail)
```

Use Anthropic SDK's tool-use to force JSON output (structured outputs).

---

## Step-by-step execution

### Step 1 — Install system CLIs + add OpenAI key
```bash
brew install ffmpeg yt-dlp
```
Shaq adds `OPENAI_API_KEY` to a new `services/analysis-service/.env.local`.

### Step 2 — Migration 005 + apply 002–005
- Write `supabase/migrations/005_video_analyses.sql` (per schema above).
- `supabase login`
- `supabase link --project-ref <ref>` (one time)
- `supabase db push` → applies 002, 003, 004, 005.
- Regenerate types: `supabase gen types typescript --linked > packages/database-types/src/index.ts`.

### Step 3 — Extend `@shaq-os/supabase-client` with a service-role *non-Next* client
Currently `service.ts` uses `next/headers`. Services don't run inside Next.js. Add a sibling file `src/service-node.ts` that uses `createClient` from `@supabase/supabase-js` directly with the service role key (no cookie machinery). Export via package `exports`.

### Step 4 — Build ingestion-service for real
- Add Hono routes: `POST /jobs`, `GET /jobs/:id`.
- Use `yt-dlp-wrap` to download to `INGESTION_TMP_DIR/<job_id>/video.mp4`.
- Use `fluent-ffmpeg` to extract 12 keyframes evenly spaced across duration (`ffmpeg -i video.mp4 -vf "select='not(mod(n,floor(N/12)))'" -vsync vfr frame-%02d.jpg`).
- Update DB row through stages: downloading → extracting → transcribing → (POST to analysis) → complete | error.
- Add request validation with zod.
- Add structured logging (one log line per stage).

### Step 5 — Build analysis-service for real
- Add Hono routes: `POST /process`, `GET /health`.
- Read video file → POST to OpenAI Whisper API (`audio.transcriptions.create`, model `whisper-1`).
- Save transcript to DB row.
- Read 4 keyframes (sampled — frame 1, 4, 7, 10), base64-encode.
- Call Anthropic SDK with system prompt + transcript + 4 image blocks, force JSON via tools.
- Write `analysis` JSON to DB row, status=complete.
- Handle errors: catch + DB row status=error + error_message.

### Step 6 — Dashboard `/references/analyze` page
- New route `apps/dashboard/app/(dashboard)/references/analyze/page.tsx`.
- Server component: list of recent `video_analyses` (latest 20, owner-scoped).
- Client component: URL input form, submits to `POST /jobs` on `ingestion-service`.
- Subscribe to row changes via Supabase realtime → live status updates.
- Result card UI: thumbnail (keyframe 1), title, transcript snippet, status, expand to show full analysis JSON pretty-printed in sections (Hook / Structure / Pacing / Shot list / Why it works / Risks).

### Step 7 — End-to-end verification

Run all three locally:
```bash
pnpm --filter dashboard dev               # :3000
pnpm --filter ingestion-service dev       # :3001
pnpm --filter analysis-service dev        # :3002
```

Test with a known viral TikTok / IG / YT URL. Confirm:
1. Row appears in `video_analyses` immediately on submit.
2. Status transitions: downloading → extracting → transcribing → analyzing → complete.
3. Keyframes visible on disk under `/tmp/shaq-os/ingestion/<job_id>/`.
4. Transcript populated.
5. Analysis JSON populated with all expected fields.
6. Dashboard card renders the analysis correctly.

### Step 8 — Commit + PR
One commit per step (where atomic), one PR. CI runs typecheck + test + build. Merge when green.

---

## Critical files to be created / modified

**New:**
- `supabase/migrations/005_video_analyses.sql`
- `packages/supabase-client/src/service-node.ts` (+ exports update)
- `services/ingestion-service/src/index.ts` (rewrite — real Hono routes)
- `services/ingestion-service/src/yt-dlp.ts`
- `services/ingestion-service/src/ffmpeg.ts`
- `services/ingestion-service/.env.local.example`
- `services/analysis-service/src/index.ts` (rewrite — real Hono routes)
- `services/analysis-service/src/whisper.ts`
- `services/analysis-service/src/claude-analyze.ts`
- `services/analysis-service/.env.local.example`
- `apps/dashboard/app/(dashboard)/references/analyze/page.tsx`
- `apps/dashboard/app/(dashboard)/references/analyze/AnalyzeForm.tsx`
- `apps/dashboard/app/(dashboard)/references/analyze/AnalysisCard.tsx`
- `apps/dashboard/app/api/video-jobs/route.ts` (proxy that forwards to ingestion-service so the browser doesn't talk to :3001 directly)

**Modified:**
- `packages/database-types/src/index.ts` (regenerated with new tables)
- `packages/supabase-client/package.json` (new export path)
- `services/ingestion-service/package.json` (deps)
- `services/analysis-service/package.json` (deps)
- `apps/dashboard/middleware.ts` (allow new route — actually `/references/...` is already inside `(dashboard)` group, no change needed)

---

## Existing functions/utilities to reuse

- `@shaq-os/supabase-client/server` for any new Next.js server code in the dashboard
- The Anthropic SDK pattern from `apps/dashboard/app/api/council/route.ts` (system prompt → user prompt → structured output)
- `apps/dashboard/components/ui/Button`, `/Input`, `/Textarea` for the new form

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| TikTok / IG block yt-dlp downloads | yt-dlp ships frequent updates that work around platform blocks; pin a recent version + retry on failure. Tested URLs first. |
| Whisper API key cost runaway | Charge cap on Shaq's OpenAI account (he can set it in OpenAI dashboard, ~$10/mo). |
| Long videos blow past Claude's context | Cap input video duration to 5 minutes for MVP. Reject longer with friendly error. |
| Local disk fills up with /tmp videos | Cleanup script in scheduler-service later (v2). For MVP, manual `rm -rf /tmp/shaq-os` is fine. |
| Two services blocking each other on synchronous HTTP | Acceptable for MVP (one user, one job at a time). Queue refactor in v2. |
| Service crashes mid-pipeline → orphaned `processing` rows | Add a startup query: on boot, set rows stuck in non-terminal states to `error` with "service restarted" message. |

---

## Verification (final gate)

1. `supabase db push` succeeds; new `video_analyses` table visible with RLS in Supabase dashboard.
2. `pnpm --filter ingestion-service dev` + `pnpm --filter analysis-service dev` + `pnpm --filter dashboard dev` all start cleanly.
3. From the dashboard, submit a real TikTok URL.
4. Within ~90 seconds, the row transitions to `status=complete` with populated transcript + analysis.
5. Refresh the page — analysis card renders all sections (Hook / Structure / Pacing / Shot list / Why it works / Risks).
6. Submit a deliberately bad URL (`https://example.com/nope`). Row ends in `status=error` with a human-readable `error_message`.
7. `pnpm typecheck && pnpm test && pnpm build` all green.
8. PR opens, CI green, merge to main.

---

## Time estimate

| Step | Effort |
|---|---|
| 1. Install CLIs + OpenAI key | 15 min (mostly Shaq's account work) |
| 2. Migration + apply + regen types | 30 min |
| 3. service-node Supabase client | 30 min |
| 4. ingestion-service real | 4–5 hours |
| 5. analysis-service real | 3–4 hours |
| 6. Dashboard `/references/analyze` | 3–4 hours |
| 7. E2E test + bug fixes | 2 hours |
| 8. PR + merge | 30 min |
| **Total** | **~2 working days** (1 if it all clicks) |

---

## What we learn from this plan

By the end:
- Shaq can paste any viral video URL → 90 seconds later, structured analysis stored forever.
- We have the **first real cross-service workflow** running, proving the architecture works.
- We discover whether the LOCAL disk + sync-HTTP model is friction-free or annoying — feeds directly into Plan 03 (Zo deployment) priorities.
- The `video_analyses` table becomes the seed corpus for the eventual "search my reference library" feature.

This is also the **moment Zo Computer becomes necessary** (Plan 03). Once Shaq is analyzing 5+ videos a day, he won't want his Mac running services in the background — the move to Zo flows naturally from "this works locally, now make it run 24/7."
