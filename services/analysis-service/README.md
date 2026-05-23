# analysis-service

Runs Claude vision over a transcript + keyframe URLs (Video Analyzer) or over a lead's image set (Lead Finder). Two endpoints, one model call shape, different prompts.

## What it does

- `POST /process` — Plan 02 Video Analyzer. Given `{ job_id, transcript, keyframe_urls }`, calls Claude with a "why does this video work" prompt and writes the structured result to `video_analyses.analysis` (jsonb).
- `POST /diagnose-lead` — Plan 04 Lead Finder. Given `{ lead_id, image_urls }`, calls Claude with a brand-diagnosis prompt and writes the result to `leads.diagnosis` (jsonb).
- No queue, no retries — Anthropic 429/5xx will bubble up.

## Where it lives

- Source: `services/analysis-service/`
- HTTP routes: `GET /health`, `GET /`, `POST /process` (auth), `POST /diagnose-lead` (auth)
- Local port: `3002`
- Fly app: `shaq-os-analysis`
- Database: writes to `public.video_analyses.analysis` and `public.leads.diagnosis`

## How a user uses it (the happy path)

Direct calls are server-to-server only. Both endpoints are reached via the dashboard:

- **Video**: ingestion-service POSTs `/process` after Whisper completes.
- **Lead**: dashboard `POST /api/leads` (with `image_urls`) forwards to `/diagnose-lead`.

## Architecture

`upstream caller (ingestion-service or dashboard) → POST endpoint (x-api-key) → Claude vision → Supabase service-role write → 200 OK with payload.`

## Env vars

| Name | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Fly | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Fly | Bypasses RLS for `video_analyses` / `leads` writes |
| `ANTHROPIC_API_KEY` | Fly | Claude API auth |
| `ANALYSIS_API_KEY` | Fly + Vercel + ingestion-service | Shared secret. Min 16 chars |
| `ANALYSIS_MODEL` | Fly | Default `claude-sonnet-4-5`. Override if you have access to a newer model |
| `PORT` | Fly | HTTP port. Default `3002` |

## Local dev

```bash
# from the monorepo root
pnpm install
cp services/analysis-service/.env.local.example services/analysis-service/.env.local
pnpm --filter analysis-service dev
# → http://localhost:3002/health
```

Sanity test once it's up:

```bash
curl -s http://localhost:3002/health
```

## Deploy

```bash
cd services/analysis-service
fly deploy
```

## Failure modes & troubleshooting

- **`401 unauthorized`**: caller's `ANALYSIS_API_KEY` does not match this service's. Same value across Vercel, ingestion-service, and this Fly app.
- **`404 Not Found` from Anthropic**: `ANALYSIS_MODEL` is set to a model your account can't access. Confirmed working: `claude-sonnet-4-5`.
- **`unauthorized` from Supabase**: `SUPABASE_SERVICE_ROLE_KEY` empty, wrong project, or rotated.
- **Diagnosis returns empty `flags`** on non-F&B leads: prompt is tuned for SG F&B ICP. Tune in `src/claude-analyze.ts` if expanding ICP.
- **Job stuck on `analyzing`**: usually a Claude timeout. There is no retry; ingestion will mark the job `error` after the Hono request times out.

## Plans / changelog

- [Plan 02](../../docs/plans/02-video-pipeline.md) — original `/process` endpoint.
- [Plan 04](../../docs/plans/04-lead-finder.md) — added `/diagnose-lead`, same Claude vision pattern with a different prompt.
