# ingestion-service

Downloads videos via yt-dlp → extracts keyframes via ffmpeg → transcribes via OpenAI Whisper → hands off to analysis-service.

## What it does

- Accepts `{ url, owner_id }` from the dashboard's `/api/video-jobs` proxy.
- Uses `yt-dlp` to pull the source video to a local tmp dir.
- Uses `ffmpeg` to extract 4–12 evenly-spaced keyframes as JPEG.
- Uploads keyframes to Supabase Storage bucket `video-keyframes` (public read).
- Calls OpenAI Whisper on the audio to produce a transcript.
- POSTs `{ job_id, transcript, keyframe_urls }` to analysis-service `/process`.
- Persists state to the `video_analyses` row (status state machine: `queued → downloading → extracting → transcribing → analyzing → complete`).

## Where it lives

- Source: `services/ingestion-service/`
- HTTP routes: `GET /health`, `GET /`, `POST /jobs` (auth), `GET /jobs/:id` (auth)
- Local port: `3001`
- Fly app: `shaq-os-ingestion` (or as named in `fly.toml`)
- Database: writes to `public.video_analyses` (migration 005), uploads to bucket `video-keyframes` (migration 006)

## How a user uses it (the happy path)

End users do not call this service directly. The flow is:

1. User pastes a video URL on `/references/analyze` in the dashboard.
2. Dashboard `POST /api/video-jobs` attaches `owner_id`, forwards to `POST /jobs` here with the shared API key.
3. Pipeline runs synchronously (no queue). Status transitions emit to `video_analyses.status`.
4. Dashboard polls `GET /api/video-jobs/[id]` until `status='complete'` or `'error'`.

## Architecture

`Dashboard → POST /jobs (x-api-key) → yt-dlp → ffmpeg → Supabase Storage upload → Whisper → POST analysis-service /process → analysis-service writes video_analyses.analysis → dashboard polls.`

## Env vars

| Name | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Fly | Supabase project URL (used by service role client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Fly | Service-role key — bypasses RLS for status writes + storage uploads |
| `INGESTION_API_KEY` | Fly + Vercel | Shared secret — must match the value the dashboard forwards as `x-api-key`. Min 16 chars |
| `ANALYSIS_API_KEY` | Fly | Shared secret used when calling analysis-service `/process` |
| `ANALYSIS_SERVICE_URL` | Fly | Default `http://localhost:3002`; in Fly set to the deployed analysis-service URL |
| `OPENAI_API_KEY` | Fly | Whisper API auth |
| `INGESTION_TMP_DIR` | Fly | Working dir for downloads. Default `/tmp/shaq-os/ingestion` |
| `KEYFRAME_BUCKET` | Fly | Storage bucket name. Default `video-keyframes` |
| `PORT` | Fly | HTTP port. Default `3001` |

## Local dev

```bash
# from the monorepo root
pnpm install
cp services/ingestion-service/.env.local.example services/ingestion-service/.env.local
# Fill in the env file with real values, including OPENAI_API_KEY
pnpm --filter ingestion-service dev
# → http://localhost:3001/health
```

Requires `yt-dlp` and `ffmpeg` on `$PATH`. On macOS: `brew install yt-dlp ffmpeg`.

## Deploy

Fly auto-deploy is not wired — deploy manually:

```bash
cd services/ingestion-service
fly deploy
```

Confirm with `fly status` and `curl https://<fly-app>.fly.dev/health`.

## Failure modes & troubleshooting

- **`401 unauthorized` on /jobs**: dashboard's `INGESTION_API_KEY` (Vercel env) does not match service's `INGESTION_API_KEY` (Fly env). Rotate both to the same value.
- **`yt-dlp: Login required`** on Instagram URLs: IG-gated content needs cookies. See codex task 04. YouTube/TikTok public URLs work without.
- **`ffmpeg: command not found`**: install ffmpeg into the Fly image — verify `Dockerfile` includes the binary.
- **Whisper 401**: `OPENAI_API_KEY` empty or rotated. Check Fly secrets.
- **Storage upload fails silently**: `SUPABASE_SERVICE_ROLE_KEY` missing or wrong project. The bucket must exist (migration 006 must have run).
- **Job stuck on `downloading`/`extracting`**: there is a reaper (`reapStuckJobs`) but no observability surface; check Fly logs.

## Plans / changelog

- [Plan 02](../../docs/plans/02-video-pipeline.md) — original spec, shipped 2026-05-22.
- Cloud deployment (Plan 03 candidate) — moving from local to Fly happened in the same sprint.
