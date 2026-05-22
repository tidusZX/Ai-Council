# Plan 06 — Content Planning Loop + Blotato Push

## Context

This plan turns the three existing apps (Photo Qualifier, AI Council, Analyzer) into a coherent **content operations system**. The AI Council stops being a vague "advisor" and becomes the **planner** that decides what gets posted each month. Photo Qualifier becomes one input among several (the archive material). Notion becomes the working calendar. Blotato closes the loop with scheduled publishing.

This finally answers "what is the AI Council *for*" — it plans Shaq's content calendar.

---

## The full loop

```
INPUTS
├─ Photo Qualifier backlog        →  existing archive material to repurpose
├─ Council "fresh idea" generator →  educational, opinion, BTS, hot-takes
└─ Manual additions               →  Shaq's own ideas
                ↓
       AI Council (planning session)
       ├─ Content Planner — drafts 10 posts/month with date + format + source
       ├─ Strategist     — reviews brand positioning fit
       ├─ Creative Director — reviews format/topic variety
       ├─ Marketing Lead — reviews engagement potential
       ├─ Critic         — finds weak links
       └─ Chairperson    — synthesizes final 10
                ↓
       Notion calendar (Status: Planned)
                ↓
       Shaq shoots / edits / writes
                ↓
       Upload to Drive → paste link in Notion → Status: Ready
                ↓
       "Push to Blotato" button → Status: Scheduled
```

---

## North-star constraints

- **Max 10 posts/month** (~2.5/week). Cap is hard; planner returns exactly 10.
- **Diversity rules** (enforced by the Content Planner persona):
  - No more than 2 posts from the same client in any 4-post window
  - At least 1 educational/opinion post per month (not just case studies)
  - Mix of formats: ~6 singles, ~3 carousels, ~1 educational by default (adjustable)
  - Avoid recently-posted clients (look back 30 days via Blotato history)
- **Carta is ignored** — added to the photo-qualifier excluded-client list permanently

## The scoring rubric (designed by the Council in session 68b41f4f-bee1-4fb6-b67a-ea403cd144af on 2026-05-23)

Every candidate post idea is scored on three axes. Sum = total (1–8). Planner prioritises 7–8, deprioritises <5.

**Axis 1 — ICP Signal (1–3):** *Does this speak to a mid-sized SG F&B or product brand's buying context?*
- 1: Generic creative/marketing content; could apply to any industry. *"How we approach brand consistency"*
- 2: References F&B/product work but the insight isn't industry-specific. *"Carousel we made for a local F&B client"*
- 3: Built around a pain point native to F&B or product brands: seasonal campaigns, product launches, menu storytelling, SKU differentiation, retail shelf presence, distributor-facing brand materials. *"How a hawker-to-restaurant brand repositioned for dine-in spend post-COVID"*

**Axis 2 — Proof Density (1–3):** *Does it demonstrate a real outcome or just process/aesthetic?*
- 1: No client outcome referenced. Process/aesthetic only.
- 2: References a real client/project, but the outcome is qualitative or vague ("client loved it", "stronger brand presence").
- 3: Specific, verifiable outcome — a metric (saves rate, follower growth, sell-through), a visible transformation (before/after with context), or a named business result. *"Packaging redesign contributed to 40% increase in retail reorder rate within 60 days"*

**Axis 3 — Format Leverage (1–2):** *Does the format maximise reach + save behavior on Instagram?*
- 1: Single image/static post. Lower algorithmic reach.
- 2: Carousel (3+ slides). Higher save rate, extended dwell time. *Bonus:* flag (without changing the number) if the carousel has a clear narrative arc (problem → process → result) vs a gallery dump.

**Special signal — "first-post candidate":** any post scoring 3 on ICP Signal AND 3 on Proof Density is the highest-conversion combination. Surface separately regardless of total score; this is the post that gets posted FIRST in the month.

**Monthly arc structure** (Council consensus across all 5 members):
> credibility anchor → proof → process → soft CTA

Apply this as the rough sequence: lead with the strongest credibility post (highest ICP+Proof combo), follow with proof-density posts, then process/educational, and close the month with a soft CTA / discovery-call invite post.

**Conversion-hook rule:** at least 2 of the 10 monthly posts must contain a conversion mechanism (DM prompt, direct question to the reader, lead magnet, discovery call offer). The Critic's hard line: *"Pretty posts without conversion architecture are brand awareness, not lead generation."*

---

## Reuse map (what already exists)

| Need | Reused from |
|---|---|
| Council members + system prompts | `packages/council-config/src/index.ts` (Strategist, Creative Director, Marketing Lead, Critic, Chairperson) |
| Council orchestration | `apps/dashboard/app/api/council/route.ts` |
| Council session UI components | `apps/dashboard/components/council/*` |
| `council_outputs.kind='posting_plan'` enum slot | `supabase/migrations/004_council_outputs.sql` — **already exists** |
| Photo Qualifier post-ideas as input | `~/photo-qualifier-agent/data/reports/results.json` backlog.posts |
| Notion exporter pattern | `~/photo-qualifier-agent/src/output/notionExporter.ts` (upsert by ID, prune stale) |
| Notion DB schema | already created at DB id `367940f1-a391-81a8-b1af-e7e0049af85e` |
| Browser → Fly auth proxy | `/api/video-jobs` pattern |
| Blotato MCP tools | `mcp__blotato_create_post`, `mcp__blotato_create_schedule`, etc — already in your stack |

---

## What's new

1. **One new council persona** — `content_planner` in `council-config`. Its system prompt is the diversity-and-balance referee. Lives alongside existing members.
2. **One new API route** — `/api/planner/run` — orchestrates a council session focused on a monthly plan
3. **One new dashboard route** — `/planner` — triggers a plan, previews the 10 proposed posts, lets you approve/edit/reject before pushing to Notion
4. **One new Notion property** — extend the Notion DB with `Scheduled Date`, `Drive Asset Link` (you paste after creating), `Blotato Post ID`
5. **One new API route** — `/api/posts/[notionPageId]/push-to-blotato` — reads the Notion row + Drive asset, creates Blotato post, writes the Blotato ID back to Notion

---

## Goals (MVP — Plan 06A)

1. Click "Plan next month" in `/planner` → triggers a council session
2. Council members each contribute (in parallel) → Chairperson synthesizes
3. UI shows 10 proposed posts with: title, suggested date, format, source (archive / new shoot / educational), draft caption, rationale
4. Shaq reviews, can ❌ a post (planner regenerates that slot), then ✅ approves the plan
5. Approved plan writes 10 Notion pages with Status="Planned" and scheduled dates spread across the month
6. Each Notion row gets a "Push to Blotato" trigger that only enables once Status="Ready" (Shaq updates manually after creating content)
7. Blotato push: reads caption + hashtags + Drive asset, creates a scheduled post, writes back the Blotato post ID and updates Notion Status="Scheduled"

## Non-goals (deferred)

- **Auto-shooting / auto-editing** — Shaq still creates content manually
- **Multi-platform per post variants** — start with one caption per post; per-platform tailoring later
- **Council "regenerate slot" UX** — for MVP, just delete + re-run the full plan if you want to swap
- **Auto-update Blotato when Notion changes** — one-way push (Notion → Blotato) only
- **Cross-app: Analyzer-generated ideas feeding the planner** — Analyzer integration as input source comes in Plan 07
- **Manual idea input** in the UI — for MVP, edit the Notion DB directly to add a manual idea

---

## Architecture

```
┌────────────────────────────────────────┐
│ apps/dashboard                         │
│  /planner                              │
│   - "Plan next month" button           │
│   - Plan preview (10 posts)            │
│   - Approve / regenerate               │
└────────────────────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────┐
│ Vercel API routes                      │
│  POST /api/planner/run                 │
│   1. Load Photo Qualifier backlog      │
│   2. Load Blotato history (30 days)    │
│   3. Run council session in parallel:  │
│      - content_planner drafts 10       │
│      - strategist / creative / market  │
│        / critic review                 │
│      - chairperson synthesizes         │
│   4. Save to council_outputs           │
│   5. Return plan to UI                 │
│                                        │
│  POST /api/planner/approve             │
│   - Write 10 Notion pages              │
│                                        │
│  POST /api/posts/[id]/push-to-blotato  │
│   - Read Notion row + Drive asset      │
│   - Blotato create + schedule          │
│   - Writeback Blotato ID               │
└────────────────────────────────────────┘
                  │
        ┌─────────┼──────────┐
        ▼         ▼          ▼
   Photo       Notion     Blotato MCP
   Qualifier   API        (existing)
   results.json
```

---

## Implementation phases

### Phase 1 — `content_planner` persona + planner API (3–4 hrs)
- Add `content_planner` to `council-config` with a system prompt focused on monthly planning + diversity rules
- New `/api/planner/run` route that orchestrates: gather inputs → run all 6 council members → save `council_outputs.kind='posting_plan'`
- Reuses the existing `/api/council` orchestration plumbing

### Phase 2 — Input gathering (2–3 hrs)
- Photo Qualifier: read `~/photo-qualifier-agent/data/reports/results.json` (or pipe via shared package) — top N posts by postability, excluding Carta
- Blotato history: call `blotato_list_posts` for last 30 days — gives the planner recent-client info
- Manual ideas: read any Notion rows tagged "Backlog" (user manually adds these)

### Phase 3 — Planner UI (3–4 hrs)
- New route `/planner` in dashboard
- "Plan next month" button → POST to `/api/planner/run`
- Render 10 cards (one per proposed post): title, date, format, source, draft caption, council rationale
- ❌ button per post (regenerates the plan with that slot excluded)
- ✅ Approve button → POST to `/api/planner/approve` → writes Notion pages

### Phase 4 — Notion writeback for planned posts (1–2 hrs)
- Extend Notion DB schema with: `Scheduled Date` (date), `Drive Asset Link` (url), `Blotato Post ID` (rich_text)
- New Status options: `Planned`, `Ready`, `Scheduled`
- Reuse the upsert-by-id pattern from photo-qualifier's `notionExporter`

### Phase 5 — Blotato push (3–4 hrs)
- New route `/api/posts/[notionPageId]/push-to-blotato`
- Reads Notion page → caption + hashtags + Drive asset URL
- Fetches Drive image (use Drive API auth from photo-qualifier-agent if needed, or pre-uploaded to a public bucket)
- Calls `mcp__blotato_create_source` (for the image) → `mcp__blotato_create_post` → `mcp__blotato_create_schedule`
- Writes back the Blotato post ID + updates Notion Status="Scheduled"
- UI button on Notion (via Notion automation pointing to Vercel webhook) OR via a "/scheduled-pipeline" route in the dashboard listing all "Ready" posts with one-click push

### Phase 6 — QA (1–2 hrs)
- Run one full loop: plan → approve → write to Notion → manually create content → upload → click push → confirm scheduled in Blotato

---

## Estimated effort

| Phase | Effort |
|---|---|
| 1 | 3–4 hrs |
| 2 | 2–3 hrs |
| 3 | 3–4 hrs |
| 4 | 1–2 hrs |
| 5 | 3–4 hrs |
| 6 | 1–2 hrs |
| **Total** | **13–19 hrs** |

Two focused days, sliceable: Phase 1+2 alone makes the planner work via API (testable with curl); Phase 3 is just the UI layer. Phase 5 (Blotato) can be deferred to a v2 if needed — without it, Shaq just copies into Blotato manually.

---

## Open questions

1. **Where does the "Blotato push" button live?** — In the dashboard at `/scheduled-pipeline`, or in Notion via a Notion-automation → webhook? My recommendation: dashboard, simpler.
2. **Drive asset hosting** — Blotato needs a public URL for the image. Options: (a) use Drive's `uc?id=` direct link if file is shared, (b) upload to Supabase Storage bucket before pushing. Recommendation: (a) for MVP.
3. **What platforms?** — Blotato supports IG/FB/X/LinkedIn/Pinterest. Default to IG-only for MVP? Multi-platform UI later.
4. **Plan cadence** — does the planner run once a month on a fixed date, or manually whenever Shaq triggers it? Recommendation: manual trigger for MVP, add scheduled run later.
