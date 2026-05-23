# Plan 06A — Council Follow-up Dialogue

## Context

Today the AI Council is a one-shot oracle. The user submits a prompt; five members and the Chairperson respond once; the session is frozen. There is no way to:

- Push back on a specific member's take ("Critic, sharpen the McDonald's hook").
- Ask for clarification ("Strategist, what did you mean by moat here?").
- Have members argue with each other.
- Iterate on a Plan 06 monthly plan slot-by-slot without regenerating the whole plan.

This plan adds **threaded follow-up rounds**. After the Chairperson's verdict, the user can ask follow-up questions. Each follow-up triggers a fresh council pass (or a subset of members, depending on scope) with the full prior conversation as context. Rounds are persisted alongside the original session.

This is also a **prerequisite for Plan 06's "review the monthly plan" UX being useful**. Currently "approve or delete a slot" is the only action. With follow-ups, the user can say "Critic, the Carta entry is too aggressive — soften it" and the Council edits that specific pick.

---

## Goals

1. **Continue an existing session** with a follow-up question. The original prompt + every prior response (members + Chairperson) become context.
2. **Persist each round** as new `messages` rows tied to the same `session_id`. Round number tracked.
3. **Address one or more members** in a follow-up — defaulting to all five + Chairperson, but the user can scope (`@critic`, `@strategist+marketing_lead`).
4. **Render rounds chronologically** on `/sessions/[id]` so the thread reads top-to-bottom.
5. **Unblock Plan 06 slot-level iteration**: a planner posting_plan can be re-opened, a specific slot referenced, and the Council can refine just that pick.

## Non-goals

- Multi-user threads. One owner per session.
- Real-time member-to-member debate without user prompting (could be a Plan 06B).
- Voice / audio input.
- Streaming the entire round in parallel — start with sequential per-member streams to keep the UX simple.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser /sessions/[id]                                     │
│  - Renders rounds 1..N chronologically                      │
│  - Follow-up input at the bottom                            │
│  - Optional @member chip selector                           │
└─────────────────────────────────────────────────────────────┘
                          │ POST /api/council/followup
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  /api/council/followup                                      │
│  - Auth check (Supabase)                                    │
│  - Load session + messages (all prior rounds)               │
│  - Determine target members (default all 5 + chair)         │
│  - For each target member: spawn /api/council stream with   │
│    context = prior messages + the new follow-up question    │
│  - Persist each new response as messages w/ round_number+1  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  messages rows w/ round_number, parent_round
```

The existing `/api/council` route stays — it's the single-member streaming primitive. The new `/api/council/followup` orchestrates a round.

---

## Schema changes (migration 007)

`messages` table gets two new columns. Both nullable for backward compat (existing rows = round 1).

```sql
alter table public.messages
  add column if not exists round_number integer not null default 1,
  add column if not exists addressed_to text[] not null default '{}',
  add column if not exists in_reply_to text references public.messages(id) on delete set null;

create index if not exists messages_session_round_idx
  on public.messages(session_id, round_number);
```

- `round_number` — 1 for the initial verdict; 2+ for each follow-up exchange.
- `addressed_to` — array of `CouncilRole` values the follow-up question targeted (empty = all).
- `in_reply_to` — optional link to a specific prior message the follow-up refers to (e.g. for slot-level Plan 06 references).

Update `packages/database-types/src/database.ts` after running the migration.

---

## API surface

### `POST /api/council/followup`

```ts
body: {
  sessionId: string (uuid)
  question: string (min 5, max 4000)
  addressedTo?: CouncilRole[]   // default: all 5 members + chairperson
  inReplyTo?: string (uuid, optional)
}
```

Behavior:

1. Auth check. 401 if no Supabase user, 403 if user doesn't own `sessionId`.
2. Query prior `messages` for the session, ordered by `round_number, created_at`.
3. Compute next `round_number = max(prior) + 1`.
4. Build context string: original prompt + every prior message rendered as `[role round.N] content`.
5. For each target member: kick off a streaming `/api/council` call w/ the context appended to system prompt and the new question as user input. Each insert is a new `messages` row tagged with `round_number` + `addressed_to`.
6. After all member streams complete, fan out a Chairperson call with the new responses as context (only if Chairperson was in `addressedTo` or `addressedTo` was empty).

Returns: `{ roundNumber, newMessageIds: string[] }`. Client uses Realtime or polling to render as streams arrive.

### `GET /api/sessions/[id]`

Existing route. Update the shape it returns so messages include `round_number` and `addressed_to` so the UI can group them. No new route needed.

---

## Prompt approach

The existing per-member system prompts (`COUNCIL_MEMBERS[].systemPrompt` and `CHAIRPERSON.systemPrompt`) stay unchanged. The follow-up context is prepended as an *additional* system block:

```
<original system prompt>

---
PRIOR ROUNDS (read carefully; the user is following up on these):

[round 1 strategist]
... text ...

[round 1 chairperson]
... text ...

[round 2 critic]
... text ...

(continued)

---
The user is now asking a follow-up. Address it directly — do not repeat your prior take unless the user asks for it. If the user names specific other members, you may reference their positions. Stay in your persona's lens.
```

Token budget: prior rounds can balloon. Cap at 25k tokens of context (truncate oldest rounds first, but always keep round 1 + the Chairperson's last synthesis).

---

## UI sketch

`/sessions/[id]` rendering:

```
┌────────────────────────────────────────┐
│  Session: <title>                      │
│  Prompt: <original prompt>             │
├────────────────────────────────────────┤
│  ─── Round 1 ────────────────────      │
│  ♟️ Strategist:  <response>            │
│  🎨 Creative Director:  <response>     │
│  ⚙️ Technical Producer:  <response>    │
│  📣 Marketing Lead:  <response>        │
│  🔍 Critic:  <response>                │
│  👑 Chairperson:  <synthesis>          │
├────────────────────────────────────────┤
│  ─── Round 2 ──── (you @critic) ──     │
│  🔍 Critic:  <response>                │
│  👑 Chairperson:  <synthesis>          │
├────────────────────────────────────────┤
│  [@all] [@strategist] [@critic] ...    │
│  ┌──────────────────────────────────┐  │
│  │ Ask a follow-up...                │  │
│  └──────────────────────────────────┘  │
│  [Send]                                │
└────────────────────────────────────────┘
```

Member chips toggle which members get the follow-up. Default: `@all` (all five + Chairperson).

For Plan 06 plan-review use case: each `posting_plan` slot card gets a "Discuss this slot" button that opens the follow-up input pre-populated with `@critic Re: <slot title> — `.

---

## Edge cases

- **A member's prior round had an error** (`is_complete = false` or empty content). Follow-up should ignore that member's prior message in context, not feed garbage in.
- **`addressedTo` includes only Chairperson**: skip member calls, just run Chairperson with the full context.
- **`inReplyTo` references a posting_plan slot from a different session**: cross-session follow-ups are out of scope — return 400.
- **Token budget exceeded**: truncate prior rounds, oldest first, but always preserve round 1.
- **Concurrent follow-ups on the same session**: lock via `session.status = 'processing'` until the round completes. Reject 409 if another round is in flight.

---

## Phases

1. **Migration 007** (10 min). Add `round_number`, `addressed_to`, `in_reply_to`. Regenerate database-types.
2. **API route + persistence** (45 min). `POST /api/council/followup` with full context assembly + per-member fan-out.
3. **UI — rendering rounds** (30 min). Update `/sessions/[id]` page to group messages by round.
4. **UI — follow-up input** (30 min). Member chip selector, input box, post-submit optimistic update.
5. **Plan 06 integration** (30 min). "Discuss this slot" button on posting_plan slot cards.
6. **Smoke test** (15 min). End-to-end: create session → ask follow-up → render → ask another follow-up scoped to one member.

Total estimate: ~3 hours.

---

## Acceptance criteria

1. Migration 007 applies cleanly. `database-types` regenerated.
2. A session with N follow-up rounds renders top-to-bottom by `round_number`, then by `created_at`.
3. A `@critic`-only follow-up produces exactly 1 Critic response (+ optionally 1 Chairperson) tagged `round_number = max(prior) + 1`.
4. A follow-up on Plan 06's posting_plan slot card lands with the slot referenced in the question, and the Critic's response addresses the slot specifically.
5. Token budget is enforced — sessions with 10+ rounds don't error out due to context length.
6. Concurrent submission returns 409 with a clear message, not a 500.

---

## Risk + mitigations

- **Context drift**: as rounds accumulate, members might wander from their original lens. Mitigation: the appended system note explicitly says "stay in your persona's lens".
- **Cost growth**: follow-ups are cheaper than fresh sessions (no full reasoning pass) but token-heavy contexts add up. Mitigation: token budget cap + opportunistic Haiku fallback for short follow-ups.
- **UI complexity**: rendering N rounds × 6 messages × streaming gets noisy. Mitigation: collapse old rounds to summary lines once round N+1 starts (one-click expand).
- **Schema migration risk**: existing `messages` rows have no `round_number`. Mitigation: default `1` in the migration so backfill is automatic.

---

## What this unlocks

- **Daily Council use** — currently Council is "set up a session, get oracle output, done." With follow-ups it's an iterative thinking partner.
- **Plan 06 slot iteration** — refine specific picks without regenerating the whole monthly plan.
- **Plan 04 (Lead Finder) deep dives** — "Strategist, why is this lead a 3 not a 5? Critic, push back."
- **Cross-app threading** — a session can reference an analyzer video, a lead diagnosis, or a planner pick via `in_reply_to`.

---

## What this does NOT unlock

- Multi-user threads (one session, one owner).
- Voice / audio input (text only).
- Council members triggering each other without user prompting.
- Cross-session memory (each session is still its own bubble — Tier 0 memory handles global context).

---

## Plans / changelog

- Queued in [`roadmap.md`](roadmap.md) since 2026-05-22.
- Drafted as a spec 2026-05-24 — ready to implement.
