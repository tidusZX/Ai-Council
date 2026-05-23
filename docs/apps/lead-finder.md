# Lead Finder

Add a Singapore business, diagnose its visual brand using Claude vision, score the opportunity, and produce a personalized outreach draft.

## What it does

- Logged-in user adds a prospective lead (business name, type, IG handle, website, location, optional image URLs).
- If `image_urls` provided, dashboard immediately forwards to analysis-service `/diagnose-lead` for a Claude-vision brand diagnosis (branding score, visual quality notes, positioning gaps).
- Diagnosis lands in `leads.diagnosis` (jsonb).
- An `outreach_writer` persona (Plan 04 Phase 5) drafts a personalized outreach message based on the diagnosis.
- `outreach_logs` table tracks touches across email / IG DM / WhatsApp / SMS / call / LinkedIn with response status.

## Where it lives

- Frontend routes: `/leads` (list), `/leads/[id]` (detail)
- API routes: `POST /api/leads` (create + diagnose), additional CRUD routes for status updates
- Backend service: `services/analysis-service` (`POST /diagnose-lead`)
- Database: `public.clients`, `public.leads`, `public.outreach_logs` (migration 003)

## How a user uses it (the happy path)

1. Open `/leads`, click "New lead".
2. Enter business details + paste up to 12 image URLs (their IG carousel, website hero shots, etc.).
3. Submit. The `leads` row is created and diagnosis runs synchronously.
4. Detail page renders: branding score, gap notes, suggested angle.
5. Click "Draft outreach" → `outreach_writer` produces a 2-3 line DM in Shaq's voice.
6. Send manually via IG / email. Log the touch as an `outreach_logs` entry.

## Architecture

`Browser → POST /api/leads (auth) → leads row → (if image_urls) POST analysis-service /diagnose-lead (x-api-key) → Claude vision → leads.diagnosis jsonb → response. Outreach drafting: separate route that reads diagnosis + uses outreach_writer persona via callAnthropicTool.`

## Env vars

See [apps/dashboard/README.md](../../apps/dashboard/README.md) and [services/analysis-service/README.md](../../services/analysis-service/README.md). Critical pair: `ANALYSIS_SERVICE_URL` + `ANALYSIS_API_KEY` must point at the deployed analysis-service.

## Local dev

```bash
pnpm --filter analysis-service dev    # 3002
pnpm --filter dashboard dev           # 3000
```

Add a test lead at `localhost:3000/leads` with image URLs from a public IG carousel.

## Deploy

Auto-deploys with dashboard. Analysis-service deploys manually via `fly deploy`.

## Failure modes & troubleshooting

- **Diagnosis returns generic / wrong angle**: prompt in `services/analysis-service/src/diagnose-lead.ts` is tuned for SG F&B. Non-F&B leads need prompt tuning.
- **`401 unauthorized`**: `ANALYSIS_API_KEY` mismatch between Vercel and Fly.
- **Status dropdown does nothing**: known unwired UI element. Codex task 03 in the queue.
- **No bulk import**: codex task 01 queues a Notion-list-style bulk-import flow. For now use single submit or run a script against `POST /api/leads`.

## ICP + funnel context

- Target: mid-sized SG F&B (multi-outlet restaurants, food brands with retail) + product brands w/ active e-commerce, ~10–100 staff, $2k/mo retainer capacity.
- Goal: 5 retainers × $2k/mo = $10k MRR.
- Realistic close rate: ~6% cold outbound. Need ~80 leads in funnel to land 5 retainers.
- Outreach kick-off date: ~2026-06-05 (per user's `project_outreach_sequencing` memory — 1–2 weeks of content first).

## What's planned (not shipped)

- **Plan 04B — Apify lead discovery**: Google Maps Places + IG Profile Scraper + Website Crawler. Auto-discovery so the funnel doesn't depend on manual list-building. Queued for 2026-06-05 alongside outreach kick-off.
- Status dropdown UI (codex task 03).
- Bulk-import from Obsidian (codex task 01).

## Plans / changelog

- [Plan 04](../plans/04-lead-finder.md) — phases 1–5 shipped 2026-05-22.
- Plan 04B — scoped in `roadmap.md`.
