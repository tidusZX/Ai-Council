# dashboard

Next.js 16 app — every user-facing SHAQ OS surface lives here. Deployed to `ai-council-tan.vercel.app`.

## What it does

- Hosts every dashboard surface: AI Council sessions, Video Analyzer, Lead Finder, Brainstorm (two lenses), Planner, Scheduled Pipeline, Import.
- Acts as the only browser-facing process — services on Fly are not reachable from the public internet.
- Owns the Supabase auth boundary: every API route asserts `supabase.auth.getUser()` before forwarding to Fly services.

## Where it lives

- Source: `apps/dashboard/`
- Frontend routes:
  - `/dashboard`, `/sessions/*` — AI Council
  - `/references/analyze` — Video Analyzer (see [docs/apps/analyzer.md](../../docs/apps/analyzer.md))
  - `/leads` — Lead Finder (see [docs/apps/lead-finder.md](../../docs/apps/lead-finder.md))
  - `/brainstorm` — Brainstorm + Audience Signal + Ember lenses (see [docs/apps/planner.md](../../docs/apps/planner.md))
  - `/planner`, `/scheduled-pipeline` — Content planner + Blotato push
  - `/import` — Bulk-add existing carousels to Notion
- API routes: `app/api/*` — see API_STACK.md in the Get Archived vault for the full catalogue.
- Vercel project: `ai-council` (root dir: `apps/dashboard`, install + build run from monorepo root).

## How a user uses it (the happy path)

1. Visit `ai-council-tan.vercel.app`, log in with email/password (Supabase).
2. Pick a surface from the top nav: Sessions, Analyze Videos, Leads, Brainstorm, Planner, Pipeline, Import.
3. Each surface persists state to Supabase + Notion as appropriate.

## Architecture

`Browser → Next.js (Vercel) → /api/* routes → (Anthropic via lib/anthropic-tool.ts) or (Fly services via x-api-key) or (Notion API) → Supabase / Notion writes.` Streaming is used only on `/api/council`; every structured route uses `callAnthropicTool` (tool_use + zod) via `lib/anthropic-tool.ts`.

## Env vars

All set in Vercel project settings (or local `.env.local` for dev).

| Name | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon key — used by browser + server SSR |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only for privileged writes |
| `ANTHROPIC_API_KEY` | yes | Used by all `callAnthropicTool` routes |
| `ANALYSIS_MODEL` | no | Override default `claude-sonnet-4-5` |
| `AI_PROVIDER` | no | `anthropic` (default) or `openai` — only `/api/council` honors this |
| `OPENAI_API_KEY` | only if AI_PROVIDER=openai | Council fallback model |
| `NEXT_PUBLIC_APP_URL` | yes | Supabase auth redirect URL |
| `INGESTION_SERVICE_URL` | yes | Fly URL of ingestion-service |
| `INGESTION_API_KEY` | yes | Shared secret w/ ingestion-service |
| `ANALYSIS_SERVICE_URL` | yes | Fly URL of analysis-service |
| `ANALYSIS_API_KEY` | yes | Shared secret w/ analysis-service |
| `NOTION_API_KEY` | yes (planner/import) | Notion integration token |
| `NOTION_DATABASE_ID` | yes (planner/import) | Content DB id |
| `BLOTATO_API_KEY` | for push-to-Blotato | Pending in prod as of 2026-05-23 |
| `BLOTATO_INSTAGRAM_ACCOUNT_ID` | for push-to-Blotato | Pending in prod |

## Local dev

```bash
# from monorepo root
pnpm install
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
# edit .env.local with real values
pnpm --filter dashboard dev
# → http://localhost:3000
```

Some surfaces require services running:

- Video Analyzer: `pnpm --filter ingestion-service dev` + `pnpm --filter analysis-service dev`
- Lead Finder diagnosis: `pnpm --filter analysis-service dev`
- Planner / Brainstorm / Audience Signal / Ember / Import: Anthropic + Notion only (no local services needed)

## Deploy

Auto-deploys on push to `main` of [tidusZX/Ai-Council](https://github.com/tidusZX/Ai-Council). Vercel project root is `apps/dashboard`; install command: `cd ../.. && pnpm install --frozen-lockfile`; build: `cd ../.. && pnpm --filter dashboard build`.

## Failure modes & troubleshooting

- **`404 Not Found` from Anthropic on any generateObject route**: legacy `@ai-sdk/anthropic@3.0.78` bug. Should not happen anymore — all 4 structured-output routes use `lib/anthropic-tool.ts` w/ the official SDK. If you see it, you've reintroduced `@ai-sdk/anthropic`.
- **`Tool X returned shape that failed zod validation`**: the model's response didn't match the declared zod schema. Re-run; if persistent, loosen the schema or tighten the system prompt.
- **`401 unauthorized` from `/api/video-jobs`**: Vercel and Fly `INGESTION_API_KEY` differ.
- **Notion writes silently fail**: `NOTION_API_KEY` missing or the integration isn't shared with the target DB.
- **Vercel build fails with workspace resolution error**: confirm Root Directory = `apps/dashboard` and the install command runs from monorepo root with `cd ../..`.

## Plans / changelog

- [Plan 01](../../docs/plans/roadmap.md) — monorepo + initial council surface.
- [Plan 02](../../docs/plans/02-video-pipeline.md) — Video Analyzer.
- [Plan 04](../../docs/plans/04-lead-finder.md) — Lead Finder.
- [Plan 06](../../docs/plans/06-content-planning-loop.md) — Brainstorm + Planner + Blotato push.
- Audience Signal + Ember lenses + `/import` shipped 2026-05-23; SDK migrated to `@anthropic-ai/sdk` via `lib/anthropic-tool.ts`.
