# AI Council

Five expert personas + a Chairperson synthesizer. Pose a question, get five rigorous angles plus a final recommendation.

## What it does

- Convenes 5 council members (Strategist, Creative Director, Technical Producer, Marketing Lead, Critic) in parallel.
- After all 5 return, the Chairperson reads their responses and writes a synthesis with a clear recommendation.
- One-shot today — the session is frozen after the Chairperson speaks. Plan 06A queues the follow-up dialogue feature.
- Personas are also reused elsewhere: Marketing Lead in `/brainstorm`, Critic in `/planner`, Content Planner in `/planner`.

## Where it lives

- Frontend routes: `/sessions/new`, `/sessions/[id]`, `/dashboard` (session list)
- API routes: `POST /api/sessions`, `GET /api/sessions/[id]`, `POST /api/council` (streamed)
- Persona definitions: `packages/council-config/src/index.ts`
- Database: `public.sessions`, `public.messages` (one row per member response + Chairperson)
- Vercel project: `ai-council`

## How a user uses it (the happy path)

1. Go to `/sessions/new`, type a question or paste a doc.
2. Submit. Backend creates a `sessions` row (status `processing`) and the client opens 5 parallel SSE streams to `/api/council`, one per member.
3. As each member finishes, its `messages` row is persisted with `is_complete = true`.
4. Once all 5 are done, the client opens a 6th stream for Chairperson, passing the prior 5 responses as context.
5. Session closes with status `complete`. View it any time at `/sessions/[id]`.

## Architecture

`Client → POST /api/sessions → sessions row → client fans out 5x POST /api/council (streamText) → messages rows → on completion → POST /api/council role=chairperson w/ context → final messages row → status=complete.`

This route still uses `streamText` from `ai` (not `callAnthropicTool`) — the streaming UX is the point. Default model: `claude-sonnet-4-5` (set via `getModel()` in the route).

## Env vars

| Name | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Default provider |
| `OPENAI_API_KEY` | no | Only if `AI_PROVIDER=openai` |
| `AI_PROVIDER` | no | `anthropic` (default) or `openai` |

(Plus the shared dashboard auth env vars — see [apps/dashboard/README.md](../../apps/dashboard/README.md).)

## Local dev

```bash
pnpm --filter dashboard dev
# → http://localhost:3000/sessions/new
```

No Fly services required.

## Deploy

Ships with the dashboard auto-deploy on push to `main`.

## Failure modes & troubleshooting

- **Stream stalls on one member**: Anthropic 429/timeout. No retry; session sits in `processing`. Manual fix: refresh the page — the streams reset.
- **Chairperson never starts**: client logic waits for all 5 members to flip `is_complete`. If one died silently, Chairperson won't trigger. Workaround: re-run the session.
- **Streaming returns 401**: Supabase cookie expired. Refresh or re-login.
- **Wrong model error**: see [apps/dashboard/README.md](../../apps/dashboard/README.md) failure modes.

## What's planned (not shipped)

- **Plan 06A — Council follow-up dialogue**: turn the one-shot into a thinking partner. Add a "Continue discussion" input below the Chairperson verdict; new endpoint takes `(session_id, follow_up_question)` and re-runs the council with prior responses as context. Each round persists as a fresh batch of `council_outputs` tied to the same session. Prereq for Plan 06's iterative plan review UX.

## Plans / changelog

- [Plan 01](../plans/roadmap.md) — original implementation.
- Plan 06A — queued, scoped in `roadmap.md`.
