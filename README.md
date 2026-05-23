# SHAQ OS

An AI-powered creative operating system — a monorepo of apps, services,
and shared packages for managing creative work, AI Council sessions, the
reference library, lead intelligence, and content production.

> The deployed AI Council dashboard lives at **ai-council-tan.vercel.app/dashboard**.
> This repo is the foundation that everything else grows from.

---

## Quick start

```bash
# 1. Install deps (one time)
pnpm install

# 2. Copy env file for the dashboard
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
# Edit apps/dashboard/.env.local with real Supabase + Anthropic credentials.

# 3. Run the dashboard locally
pnpm --filter dashboard dev
# -> http://localhost:3000
```

To run everything at once: `pnpm dev` (uses Turborepo).

---

## Repo map

```
apps/
  dashboard/                ← Next.js 16 app — every user surface lives here (Vercel)
services/                   (Node + Hono)
  ingestion-service/        ← video ingest worker (yt-dlp + ffmpeg + Whisper)
  analysis-service/         ← Claude vision over keyframes + lead diagnosis
  embeddings-service/       ← STUB (CLIP / text embeddings)
  scheduler-service/        ← STUB (cron / trend reports)
packages/
  database-types/           ← Supabase Database type definitions
  supabase-client/          ← typed browser/server/service clients
  council-config/           ← AI Council member definitions + system prompts
supabase/
  migrations/               ← SQL migrations (apply with `supabase db push`)
```

Workspace package names:
- `dashboard` (no scope)
- `ingestion-service`, `analysis-service`, `embeddings-service`, `scheduler-service`
- `@shaq-os/database-types`, `@shaq-os/supabase-client`, `@shaq-os/council-config`

---

## Common commands

All run from the repo root:

| Command | What it does |
|---|---|
| `pnpm dev` | Run every workspace's `dev` script in parallel (turbo) |
| `pnpm build` | Build every workspace |
| `pnpm test` | Run every workspace's tests |
| `pnpm typecheck` | tsc --noEmit across the monorepo |
| `pnpm lint` | Run every workspace's lint script |
| `pnpm --filter dashboard dev` | Run just the dashboard |
| `pnpm --filter ingestion-service dev` | Run just one service |
| `pnpm --filter '@shaq-os/*' typecheck` | Typecheck only the shared packages |

---

## Supabase

Schema lives in `supabase/migrations/`. Apply against your linked project:

```bash
supabase login                    # one time
supabase link --project-ref <ref> # one time
supabase db push                  # apply pending migrations
```

Current migrations:
- `001_initial.sql` — sessions, messages (existing, deployed)
- `002_creative_core.sql` — creators, projects, creative_references, prompts, shotlists
- `003_leads_crm.sql` — clients, leads, outreach_logs
- `004_council_outputs.sql` — council_outputs, reports

After applying, regenerate types into the shared package:

```bash
supabase gen types typescript --linked > packages/database-types/src/index.ts
```

---

## Deployment

**Dashboard → Vercel.** Vercel's project Root Directory should be `apps/dashboard`,
install command `cd ../.. && pnpm install --frozen-lockfile`, build command
`cd ../.. && pnpm --filter dashboard build`. Env vars set in Vercel project
settings, not committed here.

**Services → Zo Computer** (planned, separate plan). Each service has a
Dockerfile stub at `services/<name>/Dockerfile`.

---

## Conventions

- **Node 22 LTS** (see `.nvmrc`). Pnpm 11.1.3 pinned (requires Node ≥ 22.13).
- **Path-aliased imports** inside `apps/dashboard`: use `@/` for app-local code,
  `@shaq-os/<pkg>` for shared packages.
- **Workspace packages export TypeScript source directly** (no build step) —
  Next.js transpiles them via `transpilePackages` in `apps/dashboard/next.config.ts`.
- **Migrations are additive only** unless explicitly versioned as a destructive
  change. Don't edit existing migration files.
- **RLS enforced on every table.** Every new table needs select/insert/update/delete
  policies before merging.

---

## Per-surface docs

| Surface | What it is | Doc |
|---|---|---|
| dashboard | Next.js app — entry point for every user surface | [apps/dashboard/README.md](apps/dashboard/README.md) |
| ingestion-service | yt-dlp + ffmpeg + Whisper worker on Fly | [services/ingestion-service/README.md](services/ingestion-service/README.md) |
| analysis-service | Claude vision worker on Fly (video + lead) | [services/analysis-service/README.md](services/analysis-service/README.md) |
| AI Council | Five personas + Chairperson | [docs/apps/ai-council.md](docs/apps/ai-council.md) |
| Video Analyzer | TikTok/YT URL → transcript + analysis | [docs/apps/analyzer.md](docs/apps/analyzer.md) |
| Lead Finder | Diagnose + outreach for SG F&B/product brands | [docs/apps/lead-finder.md](docs/apps/lead-finder.md) |
| Planner | Brainstorm + Audience Signal + Ember + Plan 06 + Import | [docs/apps/planner.md](docs/apps/planner.md) |

---

## What's next (follow-up plans, not in this repo yet)

- Video pipeline (ingestion + analysis services with yt-dlp + ffmpeg + whisper)
- Lead intelligence (lead discovery + branding analysis)
- Embeddings worker (backfill messages.embedding + creative_references / prompts)
- Council expansion (more members, debate mode, structured outputs)
- Zo Computer deployment for long-running services
- Reference & prompt library UI in the dashboard

---

## Status

| Foundation step | Status |
|---|---|
| Monorepo skeleton (turbo + pnpm)         | ✅ |
| Shared packages extracted                 | ✅ |
| Service stubs (4)                         | ✅ |
| Supabase migrations 002-004               | ✅ (apply via `supabase db push`) |
| CI workflow                               | ✅ |
| Vercel Root Directory reconfiguration     | ⚠️  pending (manual in Vercel UI) |
| GitHub push + PR                          | ⚠️  pending (`gh auth login`) |
