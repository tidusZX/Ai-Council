# Brief 03 — Wire Lead Finder status dropdown

## Context

Lead Finder (Plan 04) shows each lead as a `LeadCard` at
`apps/dashboard/components/leads/LeadCard.tsx`. The card displays a Status
badge with the lead's current status (`new`, `qualified`, `contacted`,
`responded`, `won`, `lost`, `archived`) — but the badge is **read-only**.

The `leads.status` column is a text-checked enum:

```sql
status text not null default 'new' check (status in (
  'new','qualified','contacted','responded','won','lost','archived'
))
```

There's currently no UI way to move a lead through that pipeline. Shaq has
to update via Supabase Studio directly. Once he's actually doing outreach,
this becomes a daily click; it should be on the card.

## Goal

Make the status badge clickable: clicking opens a dropdown of the 7 valid
values; clicking one POSTs the change and updates the badge optimistically.

## Files to touch

- **New:** `apps/dashboard/app/api/leads/[id]/status/route.ts`
  - `POST` accepts `{ status: <one of the 7> }` in the body.
  - Auth-checked (must own the lead).
  - Validates status via Zod against the enum.
  - Updates the row; returns `{ ok: true, lead: ...updated row }`.
  - On invalid status or other-owner lead: returns 4xx with clear message.
- **Edit:** `apps/dashboard/components/leads/LeadCard.tsx`
  - Replace the static badge with a small dropdown (a `<button>` that
    toggles a menu of the 7 options).
  - Each option, on click, calls the new route and updates local state.
  - Style: keep the existing color mapping (`STATUS_COLORS`), just make
    it interactive.
  - Show a small spinner / "Saving…" state during the POST.
  - On error, revert + show the error inline below the dropdown.

## Acceptance criteria

1. Click a lead's status badge → menu appears with all 7 options.
2. Click "qualified" → badge immediately shows "qualified" (with the
   emerald color from STATUS_COLORS), POST fires.
3. POST returns 200; refresh the page → status persists.
4. Try POSTing an invalid status via curl — returns 400.
5. Try POSTing to a lead you don't own — returns 404 (or 403; consistent
   with `/api/leads/[id]/draft-outreach`).
6. `pnpm --filter dashboard typecheck` passes.
7. Adding the dropdown shouldn't change the LeadCard's layout (height,
   alignment).

## Constraints

- Don't change the database schema. The 7-status enum is canonical.
- Don't add new dependencies for the dropdown — a simple `<details>` or a
  hand-rolled menu is fine.
- The dropdown should close when clicking outside (basic UX hygiene).
- Don't break any existing LeadCard features (Generate DM, Show full
  diagnosis, etc.).

## How to test

```
cd ~/ai-council/apps/dashboard
pnpm dev
# /leads → click an existing lead's status badge → change it → refresh page
```
