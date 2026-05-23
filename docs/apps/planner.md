# Planner — Content Planning Loop

Notion-backed monthly content calendar. Three input lenses (Audience Signal, Brainstorm, Import), one planner that picks the best 10, one Blotato push button per row.

## What it does

- **`/brainstorm` (Brainstorm lens)** — Topic in → N postable ideas out, written in Shaq's voice. Approve to Notion as `Status='Idea'`.
- **`/brainstorm` (Audience Signal lens)** — ICP focus in → structured pain points, knowledge gaps, decision patterns, brainstormable angles. Click "Send to Brainstorm" on any angle to pre-seed the brainstormer.
- **Inline Ember pass** — Before approve, optionally sharpen captions via `EMBER_SYSTEM_PROMPT` (single-caption voice sharpener bound to `SHAQ_VOICE_PROFILE`).
- **`/import`** — Bulk-add carousels you've already designed. Status defaults to `Planned` so the planner skips them.
- **`/planner`** — Reads Notion candidates (`Status='Idea'`), reads already-locked rows, picks `10 - already_locked` new posts, sequences into a 4-week arc with scores. Writes back `Status='Planned'` + `Scheduled Date` + `Week`.
- **`/scheduled-pipeline`** — Lists `Status in [Planned, Scheduled]` rows. Each row has a "Push to Blotato" button that uploads the image + schedules the IG post and flips status to `Scheduled`.

## Where it lives

- Frontend routes: `/brainstorm`, `/planner`, `/scheduled-pipeline`, `/import`
- API routes:
  - `POST /api/brainstorm/run`, `POST /api/brainstorm/approve`
  - `POST /api/audience-signal/run`
  - `POST /api/voice/sharpen`
  - `POST /api/planner/candidates` (GET), `POST /api/planner/run`, `POST /api/planner/approve`
  - `POST /api/import-existing`
  - `POST /api/posts/[id]/push-to-blotato`
- Persona prompts: `packages/council-config/src/index.ts` (`CONTENT_PLANNER_SYSTEM_PROMPT`, `BRAINSTORMER_SYSTEM_PROMPT`, `MARKET_RESEARCHER_SYSTEM_PROMPT`, `EMBER_SYSTEM_PROMPT`, `SHAQ_VOICE_PROFILE`)
- Database (state-of-record): **Notion Content DB** — not Supabase. Supabase stores derived artifacts only (`council_outputs.kind='posting_plan'`).
- External: Blotato API (`apps/dashboard/lib/blotato.ts`).

## Notion DB schema (must exist)

Properties read/written:

| Property | Type | Read by | Written by |
|---|---|---|---|
| Title | title | all | brainstorm/approve, import |
| Format | select (`🎠 Carousel`, `🖼 Single`, `🎓 Educational`, `✏️ Re-edit`) | candidates, push | all writers |
| Status | select (`Idea`, `Planned`, `Scheduled`, `Published`) | candidates, planner-gap, push | brainstorm/approve, planner/approve, push, import |
| Idea Id | rich_text | candidates, planner-gap | all writers |
| Shoot | rich_text | candidates | brainstorm/approve, import |
| Hook | rich_text | candidates | all writers |
| Draft Caption | rich_text | candidates, push | all writers |
| Client | select | candidates | import |
| Hashtags | multi_select | candidates | import |
| Postability | number | candidates | (Photo Qualifier CLI) |
| Drive Link | url | candidates, push | import |
| Image | files | push (preview / Blotato source) | manual drag-in |
| Scheduled Date | date | planner-gap | planner/approve, import |
| Week | number | planner-gap | planner/approve, import |

For calendar-view image previews: drag a JPG into the `Image` property of each row, then in Notion calendar view settings set "Card preview" → "Image".

## How a user uses it (the happy path)

1. Open `/brainstorm`, lens = **Audience Signal**, topic = ICP focus.
2. Pick a top-3 angle, click "Send to Brainstorm →".
3. Lens auto-flips to **Brainstorm**, topic pre-filled. Count = 5, run.
4. Select keepers, click "🔥 Sharpen with Ember" to apply voice pass.
5. Click "Approve selected" → Notion rows land with `Status='Idea'`.
6. Open `/planner`, set monthLabel, click run. Planner reads already-locked rows, plans the remainder.
7. Approve picks → planner writes `Scheduled Date` + flips to `Status='Planned'`.
8. Open `/scheduled-pipeline`, push each row to Blotato.

## Architecture

`Browser → /api/brainstorm/run or /api/audience-signal/run → callAnthropicTool → Anthropic. /api/voice/sharpen → callAnthropicTool. /api/brainstorm/approve + /api/import-existing → Notion API. /api/planner/candidates → Notion read. /api/planner/run → reads already-occupied via listOccupiedSlots → callAnthropicTool → council_outputs.kind='posting_plan'. /api/planner/approve → Notion update_page. /api/posts/[id]/push-to-blotato → Blotato API + Notion status flip.`

## Env vars

See [apps/dashboard/README.md](../../apps/dashboard/README.md). Required: `ANTHROPIC_API_KEY`, `NOTION_API_KEY`, `NOTION_DATABASE_ID`, plus `BLOTATO_API_KEY` + `BLOTATO_INSTAGRAM_ACCOUNT_ID` for the push button.

## Local dev

```bash
pnpm --filter dashboard dev
# → http://localhost:3000/brainstorm
```

No services required.

## Deploy

Auto-deploys with the dashboard.

## Failure modes & troubleshooting

- **`/planner/run` returns warning "already at cap"**: Notion has ≥10 rows in `Status in [Planned, Scheduled, Published]` for the target month. Nothing to add — either change month or archive/delete rows in Notion.
- **`/planner/run` errors with `bad shape` or zod validation fail**: model returned malformed picks. Re-run; if persistent, the candidate pool may be too thin.
- **Blotato push 401**: `BLOTATO_API_KEY` not set in Vercel. Status flip won't happen either.
- **Notion schema drift error**: a property was renamed or its type changed. Reconcile with the schema table above.
- **Ember sharpen returns flags + skip**: the draft is fundamentally off-topic. Edit the draft caption manually and re-run.
- **Audience Signal angle "Send to Brainstorm" doesn't persist**: it's UI-only — state lives in client until you actually run brainstorm.

## Plans / changelog

- [Plan 06](../plans/06-content-planning-loop.md) — all 5 phases shipped 2026-05-23; Phase 5 awaiting `BLOTATO_API_KEY` in prod.
- Audience Signal + Ember + Import shipped 2026-05-23.
- Planner gap fix (don't double-book) shipped 2026-05-23.
