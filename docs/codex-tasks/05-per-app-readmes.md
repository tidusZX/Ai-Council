# Brief 05 — Per-app READMEs

## Context

SHAQ OS has 4 user-facing surfaces and 3 backend services, but no per-app
documentation. When Shaq comes back to a feature in 6 months, or hands off
to a contractor, there's no quick "what is this, how do I run it, what
breaks" doc.

The repo-level `README.md` exists but is generic. Each app/service should
have a tight README that's read-and-go.

## Goal

Write 4 short, scannable READMEs — one per app surface — that get someone
productive in 5 minutes.

## Files to create

1. `apps/dashboard/README.md` (rewrite if exists — should be skinny if present)
2. `services/ingestion-service/README.md`
3. `services/analysis-service/README.md`
4. `docs/apps/lead-finder.md` — Lead Finder spans dashboard + analysis-service so it gets its own product README. Same for:
5. `docs/apps/planner.md` — Plan 06 spans dashboard + Notion + Blotato.
6. `docs/apps/analyzer.md` — Plan 02/03 spans dashboard + ingestion + analysis.
7. `docs/apps/ai-council.md` — Plan 06A's discussion thread lives here too.

(So in total: 3 service READMEs + 4 app READMEs = 7 files.)

## Required sections per README

Use this template. Keep total length per README under 200 lines.

```markdown
# <App / Service Name>

One-line description.

## What it does
3-5 bullets in plain English. What user problem does it solve?

## Where it lives
- Frontend route(s): `/...`
- API route(s): `/api/...`
- Backend service: `services/...` (if applicable)
- Fly app: `<app-name>` (if applicable)
- Vercel project: ai-council

## How a user uses it (the happy path)
Numbered steps as a user would experience them.

## Architecture (1-paragraph)
Source → API → service → DB. Skip if it's a single-route feature.

## Env vars
Table: name, scope (Vercel/Fly/both), what it's for. Include the actual
variable names — don't be vague.

## Local dev
The exact command(s) to run the app locally. If it depends on other
services being up, name them.

## Deploy
The exact command(s) or trigger (auto-deploy on push to main, etc.).

## Failure modes & troubleshooting
3-5 known errors and what causes them. Reference real error strings
when possible.

## Plans / changelog
Link to relevant `docs/plans/*.md` files.
```

## Acceptance criteria

1. All 7 files exist and follow the template above.
2. Each file is between 60 and 200 lines.
3. Each app README's "Local dev" command actually works (try it).
4. Each app README's env vars section lists every env var the app
   actually reads (search the source for `process.env.` to verify).
5. Cross-links between READMEs and `docs/plans/*` are correct.
6. The root `README.md` gets a short table linking to all 7 of these.

## Constraints

- No marketing fluff. Be terse. Each section earns its place.
- Don't invent features that aren't shipped. Document the state as-is.
- Don't expose secret values. Reference env var names, not values.
- Don't duplicate `docs/plans/*` content. Plans are the "what we're
  building"; READMEs are the "what exists today".

## How to test

- `find apps services docs -name 'README.md' -o -name 'apps/*.md' | wc -l`
  should show 7+ new files.
- Open each, scroll, make sure no section is missing.
