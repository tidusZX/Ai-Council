/**
 * POST /api/leads/discover — Plan 04B + Plan 13
 *
 * Triggers an Apify Actor run for auto-discovering leads.
 * Modes:
 *   - ig_handles (Phase 1): paste handles → IG Profile Scraper → leads
 *   - maps_category (Phase 2): pick category → Google Maps Extractor →
 *     each business gets ICP-scored, only score ≥ minIcpScore lands
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
const MAPS_ACTOR = 'compass/google-maps-scraper'

const Body = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('ig_handles'),
    igHandles: z.array(z.string().min(1).max(60)).min(1).max(30),
    postsPerHandle: z.number().int().min(1).max(24).default(12),
  }),
  z.object({
    mode: z.literal('maps_category'),
    category: z.string().min(3).max(120),
    location: z.string().min(2).max(80).default('Singapore'),
    minReviews: z.number().int().min(0).max(10000).default(50),
    maxResults: z.number().int().min(1).max(50).default(30),
    /**
     * Only insert leads whose ICP score is at least this. Filters
     * the discovery noise before it lands in /leads.
     */
    minIcpScore: z.number().int().min(1).max(10).default(6),
  }),
])

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

  const data = parsed.data

  // --- ig_handles ------------------------------------------------------
  if (data.mode === 'ig_handles') {
    const normalizedHandles = Array.from(
      new Set(
        data.igHandles
          .map((h) => h.trim().replace(/^@/, '').toLowerCase())
          .filter((h) => h.length > 0)
      )
    )

    const inputPayload: Json = {
      handles: normalizedHandles,
      postsPerHandle: data.postsPerHandle,
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

    try {
      const client = new ApifyClient({ token: apifyToken })
      const apifyRun = await client.actor(IG_PROFILE_ACTOR).start({
        usernames: normalizedHandles,
        resultsLimit: data.postsPerHandle,
      })
      await supabase
        .from('discovery_runs')
        .update({ apify_run_id: apifyRun.id, status: 'running' })
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

  // --- maps_category ---------------------------------------------------
  const inputPayload: Json = {
    category: data.category,
    location: data.location,
    minReviews: data.minReviews,
    maxResults: data.maxResults,
    minIcpScore: data.minIcpScore,
  } as unknown as Json
  const { data: runRow, error: runErr } = await supabase
    .from('discovery_runs')
    .insert({
      owner_id: user.id,
      mode: 'maps_category',
      input: inputPayload,
      apify_actor_id: MAPS_ACTOR,
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

  try {
    const client = new ApifyClient({ token: apifyToken })
    const apifyRun = await client.actor(MAPS_ACTOR).start({
      searchStringsArray: [data.category],
      locationQuery: data.location,
      maxCrawledPlacesPerSearch: data.maxResults,
      language: 'en',
      includeWebResults: false,
    })
    await supabase
      .from('discovery_runs')
      .update({ apify_run_id: apifyRun.id, status: 'running' })
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
