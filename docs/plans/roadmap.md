# SHAQ OS — Roadmap

_Last updated: 2026-05-22_

## North Star

**$10k MRR in retainer clients for creative services.**

SHAQ OS is a personal marketing + ops stack for a Singapore commercial photographer. Every app exists to serve that goal — either by generating attention (top of funnel), sharpening creative output, or eventually converting attention to paying retainer clients.

```
Photo Qualifier  →  posts go live constantly (visibility)
Analyzer         →  ideas for self + a service offering to clients
AI Council       →  validates which ideas/projects to ship
                                                         ↓
                                              (currently no system)
                                                         ↓
Lead Finder      →  converts visibility into signed retainers ($10k MRR)
```

The 3 EOW apps are the **flywheel**. Lead Finder is the **conversion engine** — highest-leverage next thing after EOW.

---

## Apps (user-facing surfaces)

| # | App | Where it lives | Status | What "running" means |
|---|---|---|---|---|
| 1 | **AI Council** | `apps/dashboard` → `/sessions/*` | 🟡 Built, unverified on prod | Create a session, submit a prompt, see 3+ council members respond, outputs persisted |
| 2 | **Video Analyzer** | `apps/dashboard` → `/references/analyze` | ✅ Shipped 2026-05-22 (Plan 03) | Paste TikTok/YouTube URL → keyframes + transcript + Claude analysis |
| 3 | **Photo Qualifier** | `~/photo-qualifier-agent` (CLI) | ✅ Working — 82 ideas in cache from 2026-05-22 run | `npm run full` produces Markdown + Google Sheet with post ideas per client |

## Supporting infrastructure

| Layer | Used by | Status |
|---|---|---|
| Supabase (auth + storage + DB) | Council, Analyzer | ✅ Live, 6 migrations applied |
| Fly.io services (ingestion, analysis) | Analyzer | ✅ Deployed |
| Vercel (Next.js dashboard) | Council, Analyzer | ✅ `ai-council-tan.vercel.app` |
| Command Centre (visual launcher) | Meta — across all apps | 🟠 Built in May 21 session, state unverified |
| War Room | Wednesday workflow (HubSpot/Sheets/Notion) | 🟠 Separate concept, not blocking |

## Future apps (already partially scoped)

### Lead Finder — most spec'd of the backlog
Already has a full Supabase schema at [supabase/migrations/003_leads_crm.sql](supabase/migrations/003_leads_crm.sql):

- `clients` — businesses already working with Shaq
- `leads` — prospective Singapore businesses with `opportunity_score` (0–100), `status` (new → qualified → contacted → responded → won/lost), and `diagnosis` jsonb (branding score, visual quality notes, positioning gaps)
- `outreach_logs` — per-lead touchpoints across email / IG DM / WhatsApp / SMS / call / LinkedIn, with response tracking

Pattern: **find Singapore F&B + product brands with weak visual brand → diagnose the gap → score opportunity → multi-channel outreach with response tracking**. Schema is ready; no service or UI yet.

### Other future systems (named in past sessions, not scoped)

- Content Planner
- Prompt Library
- Campaign Generator
- Asset Intelligence
- Social Media Intelligence

## EOW backlog (this week)

| Item | Why | Effort |
|---|---|---|
| Fix Photo Qualifier planner regression | Currently 0 post ideas; data is fine, planner failed silently | S (in progress) |
| AI Council prod audit — verify only, no expansion | Direction is currently unclear; confirm it runs and park further work until a clear use case emerges | S |
| README per app | So future-you can run each cold | S |

## Post-EOW priorities (in order)

1. **Plan 06 — Content Planning Loop + Blotato Push** ([06-content-planning-loop.md](06-content-planning-loop.md)) — turns AI Council into the *planner* (not just validator) of a monthly 10-post calendar, with Photo Qualifier as one input source. Closes the loop: plan → Notion → create content → Blotato button → scheduled. ~13–19 hrs. This finally answers "what is AI Council for".
2. **Plan 04 — Lead Finder** ([04-lead-finder.md](04-lead-finder.md)) — the conversion engine to $10k MRR. Targets: mid-sized Singapore F&B and growing product brands able to sustain $2k/mo retainers. ~10 hrs.
3. **Plan 05 — Photo Tagging & Search** — extend Photo Qualifier so each analyzed image is tagged (subject, setting, framing, composition) and tags push to Notion for searchable retrieval. Deferred until Lead Finder is shipping conversions.
4. **Instagram cookies for yt-dlp** — unblocks IG-gated content in Analyzer + Lead Finder. ~1 hour fix.

## Future / unscoped backlog

| Item | Why | Effort |
|---|---|---|
| Embeddings + semantic search over `video_analyses` | Search/cluster analyzed videos; foundation for cross-app reuse | M |
| Wire `council_outputs` typed kinds | Only if AI Council direction crystallizes — currently parked | M |
| Connect Analyzer → Council (let Council reference saved videos) | Only if AI Council direction crystallizes — currently parked | M |
| Scheduler-service | Periodic digests / weekly briefs / re-runs | M |
| `creative_core` migration → Creative OS surfaces | Unclear scope until Creative OS is defined | L |

## Assumptions to confirm

1. "Running by EOW" means **demonstrable end-to-end**, not polished
2. Command Centre is separate from SHAQ OS — visual launcher across all systems; not one of the 3 EOW apps
3. War Room is the Wednesday HubSpot/Sheets/Notion workflow; not on EOW list
4. AI Council passes the audit (worst case: a couple of bugs, not a rewrite)

## Suggested sequence — this week

1. Photo Qualifier planner fix (now)
2. AI Council prod audit (15–30 min)
3. README per app
4. Instagram cookies (if spare time Sat/Sun)

---

## Current state snapshot (2026-05-22 evening)

| Thing | State | Notes |
|---|---|---|
| Video Analyzer | ✅ Shipped | YouTube/TikTok work, IG gated |
| Photo Qualifier scan + AI triage | ✅ Working | 2550/3206 analyzed, 137 clusters (last run 2026-05-22 22:43) |
| Photo Qualifier → Notion export | ✅ Already wired | Auto-pushes when ideas generated |
| Photo Qualifier post-idea planner | ✅ Working — 82 ideas | Was a partial-scan artifact on 2026-05-21, not a code bug. Full scan emits ideas as expected. Open improvement: format mix (0 EDU / 0 RE-EDIT in 82 picks) — prompt tuning candidate |
| AI Council | 🟡 Built, unaudited | Code there, never verified end-to-end on prod |
| Lead Finder schema | ✅ Migration 003 applied | No service / UI |
| Notion DB | ✅ Live | Accepting upserts |
| Blotato MCP | ✅ Available | Tools in stack, not yet wired |
| Plans documented | ✅ | Roadmap + Plan 04 + Plan 06 |

## Revised priority (2026-05-22 — based on 2-week content runway)

Shaq confirmed he has 2 weeks of content already done. That changes the calculus: the slack is in content production, not in revenue acquisition. Prioritize the thing without slack.

| # | Item | Effort | Rationale | Status |
|---|---|---|---|---|
| 1 | **Plan 04 — Lead Finder MVP** (Phases 1–4) | ~7 hrs | Direct path to $10k MRR. Zero runway here. | ✅ Shipped 2026-05-22 |
| 2 | AI Council quick audit | ~15 min | Cheap, frees mental load. | ✅ Passed 2026-05-22 |
| 3 | Confirm Photo Qualifier `analyse` produced ideas + push the 15 non-Carta to Notion | ~30 min | Manual content workflow holds until Plan 06 ships. | 🟡 Pending |
| 4 | **Plan 04 Phase 5** — outreach drafting | ~1.5 hrs | Outreach drafting via a new `outreach_writer` persona. | ✅ Shipped 2026-05-22 |
| 4b | **Plan 04 Phase 6** — start outreach with existing 30-prospect list | ~30 min setup, ongoing usage | Deferred until 1–2 weeks of active social-media posting. Cold DMs land 3× better when the target lands on a fresh, professional feed. Shaq has a 30-prospect list ready from prior work. | Deferred — kick off ~2026-06-05 |
| 5 | **Plan 06A — AI Council Follow-up Discussion** | ~3–5 hrs | Currently Council is one-shot (verdict, then frozen). Adding follow-up dialogue improves daily Council usage AND unblocks Plan 06's iterative plan review UX. | Queued |
| 6 | **Plan 06 — Content Planning Loop** | ~13–19 hrs | Closes Notion → Planner → Approve → Push → Scheduled. | ✅ All 5 phases shipped 2026-05-23 · Phase 5 awaiting BLOTATO_API_KEY env var |
| 7 | **Plan 04B — Apify lead discovery** | ~3–4 hrs | Auto-discovery + IG image fetching. Save until outreach kicks off 2026-06-05. | Queued for 2026-06-05 |
| 8 | Plan 05 — Photo Tagging | ~5 hrs | After 04 + 06 prove themselves. | Backlog |
| 9 | Instagram cookies | ~1 hr | Convenience fix, no rush. | Backlog |

The compounding effect: Lead Finder generates leads → some convert → you deliver client work + need more leads → Plan 06 automates content so you have time for client delivery + more outreach. **Lead Finder unlocks revenue. Plan 06 unlocks time. Revenue first.**

### About Plan 04B — Apify-powered lead discovery (queued for ~2026-06-05)

Apify Actors (pre-built web scrapers) would close the "find businesses + collect their images" front of Lead Finder. Realistic integrations:

- **Google Maps Places scraper** → filter SG by category + review count to surface 200+ candidate brands
- **Instagram Profile Scraper** → pull 12 recent post images from a target IG handle, ready for `/diagnose-lead`
- **Website Content Crawler** → extract IG handle + email from a brand's contact page
- **Instagram Video Scraper** → fallback when yt-dlp hits "login required" on IG-gated content (also helps Analyzer)

**Cost:** ~$49/mo base tier covers expected usage; $99-499 only at heavy scale (1000+ profile scrapes/mo).

**Why deferred to 2026-06-05:** No value before outreach is active. Manual paste through `/leads` is fine for testing diagnosis quality on the existing 30-prospect list. Build Plan 04B alongside the outreach kickoff so the discovery engine starts feeding leads exactly when Shaq has time to DM them.

**Effort estimate:** ~3-4 hrs to wire one Actor (IG Profile Scraper) end-to-end. Add a `discovery_source` field to `leads` so we can A/B human-curated vs scraped lead quality.

**Ban-risk note:** Apify rotates IPs and respects rate limits, but Instagram occasionally flags scraped accounts. Never link Shaq's own logged-in account — use a separate scraping identity.

### About Plan 06A — Council Follow-up Discussion

**Current limitation:** After convening, the Council gives a verdict and the session is frozen. No way to push back on specific takes, ask for clarification, or have members argue further.

**Spec sketch:**
- Add a "Continue discussion" input below the Chairperson's verdict on `/sessions/[id]`
- New API endpoint that takes `(session_id, follow_up_question)` and runs the council again with the original prompt + all prior responses as context
- Save the new round as a fresh set of `council_outputs` rows tied to the same session
- Render rounds chronologically in the session view

**Why it's a prerequisite to Plan 06:** Plan 06's "review the monthly plan" UX is currently "approve or delete a slot." With follow-up discussion, you can say *"Critic, sharpen the McDonald's case-study hook"* and the Council refines specific slots without regenerating the whole plan.

**Why it's worth doing even without Plan 06:** Every Council session today is a one-shot oracle. With follow-up, it becomes a real thinking partner — useful daily.
