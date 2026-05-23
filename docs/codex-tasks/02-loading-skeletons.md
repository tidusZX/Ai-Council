# Brief 02 — Loading skeletons on /planner + /scheduled-pipeline

## Context

Two dashboard routes currently have rough loading UX:

- **`/planner`** — clicking "Plan next month" fires `/api/planner/candidates`
  (~3s) then `/api/planner/run` (~30–60s). The button text changes
  ("Reading Notion…", "Planning… (~30–60s)") but the page body below stays
  empty until the plan arrives. That's a 60-second stare-at-nothing window.
- **`/scheduled-pipeline`** — SSR fetch of Notion rows can take 1–3s; the
  page momentarily renders an empty state before the rows appear.

## Goal

Add reusable `Skeleton` placeholder components so both routes give visual
feedback during loading.

## Files to touch

- **New:** `apps/dashboard/components/ui/Skeleton.tsx` — basic shimmer block component.
  - Accepts `className`, `width`, `height` (or fall back to className).
  - Use a simple animated gradient (Tailwind `animate-pulse bg-zinc-200`).
- **Edit:** `apps/dashboard/components/planner/PlannerWorkflow.tsx`
  - When `phase === 'fetching'` or `phase === 'planning'`, render a
    `<PlanSkeleton />` block below the form (5 placeholder rows that mimic
    the real PostingPlanCard layout — header bar + 4 weeks of cards).
- **New:** `apps/dashboard/components/planner/PlanSkeleton.tsx`
- **Edit:** `apps/dashboard/components/pipeline/PipelineList.tsx`
  - If `initial.length === 0` AND no error was passed, treat as "loading"
    and show a `<PipelineSkeleton />` (4 placeholder rows). But: the empty
    state already exists for the "Nothing in the pipeline" message — only
    show skeleton during the brief SSR window, not as the empty state.
  - HINT: the page component can pass an `isInitialLoad` boolean or you can
    use Suspense around the list. Simplest: server component already has
    rows by the time it renders, so the SSR flash IS the only loading
    window; if no good Suspense story, skip the pipeline skeleton and just
    do the planner one. **The planner skeleton is the high-value piece.**

## Acceptance criteria

1. Click "Plan next month" with the Network tab open — within 200ms the
   page body shows a skeleton block (header + week cards), no longer
   empty.
2. When the plan arrives, the skeleton is replaced with the real
   PostingPlanCard — no layout shift > 30px.
3. The Skeleton component is exported and reusable elsewhere.
4. `pnpm --filter dashboard typecheck` passes.
5. No accessibility regression — skeleton blocks have `aria-hidden="true"`.

## Constraints

- Don't introduce new dependencies (no `react-loading-skeleton` etc.).
  Pure Tailwind + a small wrapper is enough.
- Don't change the existing button text logic — those state labels are
  good as they are.
- The skeleton's visible shape should roughly match what the real content
  looks like — wrong-shape skeletons are worse than no skeleton.

## How to test

```
cd ~/ai-council/apps/dashboard
pnpm dev
# Open http://localhost:3000/planner, click "Plan next month",
# observe the skeleton in the gap between request and response.
```
