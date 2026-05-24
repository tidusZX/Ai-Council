/**
 * POST /api/leads/discover — Plan 04B Phase 1
 *
 * Triggers an Apify Actor run for auto-discovering leads. Phase 1 supports
 * ig_handles mode only (paste IG handles → Apify scrapes recent posts).
 * Maps + website-crawl modes deferred to Phase 2.
 *
 * Persists a discovery_runs row with status='queued', kicks off the Actor,
 * returns the runId. Browser polls GET /api/leads/discover/[runId] to see
 * progress and pick up the new leads when ready.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { ApifyClient } from 'apify-client'
import type { Json } from '@shaq-os/database-types'

export const maxDuration = 30

const IG_PROFILE_ACTOR = 'apify/instagram-profile-scraper'

const Body = z.object({
  mode: z.literal('ig_handles'),
  igHandles: z
    .array(z.string().min(1).max(60))
    .min(1)
    .max(30),
  postsPerHandle: z.number().int().min(1).max(24).default(12),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }
  const { igHandles, postsPerHandle } = parsed.data

  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json(
      {
        error:
          'APIFY_API_TOKEN not set in env. Sign up at apify.com, generate a token under Settings → Integrations, and add it to Vercel env vars.',
      },
      { status: 503 }
    )
  }

  // Strip @ + lowercase to normalize handles.
  const normalizedHandles = Array.from(
    new Set(
      igHandles
        .map((h) => h.trim().replace(/^@/, '').toLowerCase())
        .filter((h) => h.length > 0)
    )
  )

  // Persist the run row first so a failure to call Apify is still tracked.
  const inputPayload: Json = {
    handles: normalizedHandles,
    postsPerHandle,
  } as unknown as Json
  const { data: runRow, error: runErr } = await supabase
    .from('discovery_runs')
    .insert({
      owner_id: user.id,
      mode: 'ig_handles',
      input: inputPayload,
      apify_actor_id: IG_PROFILE_ACTOR,
      status: 'queued',
    })
    .select('id')
    .single()
  if (runErr || !runRow) {
    return NextResponse.json(
      { error: 'failed to persist discovery_run', message: runErr?.message },
      { status: 500 }
    )
  }
  const runId = runRow.id

  // Fire off the Apify run (non-blocking — returns the actor run handle).
  try {
    const client = new ApifyClient({ token: apifyToken })
    const apifyRun = await client.actor(IG_PROFILE_ACTOR).start({
      usernames: normalizedHandles,
      resultsLimit: postsPerHandle,
    })
    await supabase
      .from('discovery_runs')
      .update({
        apify_run_id: apifyRun.id,
        status: 'running',
      })
      .eq('id', runId)
    return NextResponse.json({
      runId,
      apifyRunId: apifyRun.id,
      status: 'running',
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await supabase
      .from('discovery_runs')
      .update({ status: 'failed', error_message: message.slice(0, 500) })
      .eq('id', runId)
    return NextResponse.json(
      { error: 'apify trigger failed', message, runId },
      { status: 502 }
    )
  }
}
