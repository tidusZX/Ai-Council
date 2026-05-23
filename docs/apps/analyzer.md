# Video Analyzer

Paste a TikTok / YouTube / IG / Vimeo URL → get back transcript, sampled keyframes, and a Claude-vision "why this video works" analysis.

## What it does

- Downloads the source video via yt-dlp.
- Extracts 4–12 evenly-spaced keyframes via ffmpeg, uploads to Supabase Storage.
- Transcribes the audio via OpenAI Whisper.
- Sends transcript + keyframe URLs to Claude vision for structured analysis (hook, pacing, visual language, transferable lessons).
- Persists the full result as a `video_analyses` row scoped by `owner_id`.

## Where it lives

- Frontend route: `/references/analyze`
- API routes: `POST /api/video-jobs`, `GET /api/video-jobs/[id]`
- Backend services: `services/ingestion-service` (download + ffmpeg + Whisper) + `services/analysis-service` (Claude vision)
- Fly apps: `shaq-os-ingestion`, `shaq-os-analysis`
- Database: `public.video_analyses` (migration 005), bucket `video-keyframes` (migration 006)

## How a user uses it (the happy path)

1. Open `/references/analyze`.
2. Paste a video URL. Submit.
3. Page polls `/api/video-jobs/[id]` every few seconds. Status moves: `queued → downloading → extracting → transcribing → analyzing → complete`.
4. Once `complete`, the page renders the keyframes, transcript, and the structured analysis (cards).

## Architecture

`Browser → POST /api/video-jobs (Supabase auth) → ingestion-service POST /jobs (x-api-key) → yt-dlp → ffmpeg → Supabase Storage → Whisper → POST analysis-service /process (x-api-key) → Claude vision → video_analyses.analysis written → browser polls and renders.`

Everything is synchronous; there is no queue layer.

## Env vars

See [apps/dashboard/README.md](../../apps/dashboard/README.md) and [services/ingestion-service/README.md](../../services/ingestion-service/README.md). The shared secrets `INGESTION_API_KEY` and `ANALYSIS_API_KEY` must match across all three (Vercel, ingestion-service Fly, analysis-service Fly).

## Local dev

Three processes:

```bash
pnpm --filter ingestion-service dev   # 3001
pnpm --filter analysis-service dev    # 3002
pnpm --filter dashboard dev           # 3000
```

Set `INGESTION_SERVICE_URL=http://localhost:3001` and `ANALYSIS_SERVICE_URL=http://localhost:3002` in `apps/dashboard/.env.local`.

Test URL that works reliably: any public YouTube video. Instagram URLs need cookies (see failure modes).

## Deploy

Dashboard ships on push to `main`. Services deploy manually:

```bash
cd services/ingestion-service && fly deploy
cd services/analysis-service && fly deploy
```

## Failure modes & troubleshooting

- **`Login required` on Instagram URLs**: yt-dlp can't access gated content without auth cookies. Codex task 04 queues a fix — meanwhile, stick to public YouTube / TikTok / Vimeo URLs.
- **Job stuck on `downloading`**: yt-dlp child process hung. There is a `reapStuckJobs` helper but no auto-restart — check Fly logs.
- **Job ends in `error` with no message**: typically a Whisper or Claude 5xx. Re-submit the same URL — produces a fresh `job_id`.
- **Keyframes don't load**: storage bucket `video-keyframes` must be public read. Verify migration 006 ran.
- **`404 Not Found` from Anthropic**: analysis-service is using a model your key can't reach. Default `claude-sonnet-4-5` works for all current keys.

## Plans / changelog

- [Plan 02](../plans/02-video-pipeline.md) — local-only MVP. Shipped 2026-05-22.
- Cloud move (informal Plan 03) — services deployed to Fly same sprint.
- Deferred: scene detection, CLIP embeddings, queue layer.
