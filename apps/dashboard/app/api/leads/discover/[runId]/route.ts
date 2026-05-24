/**
 * GET /api/leads/discover/[runId] — Plan 04B Phase 1
 *
 * Poll endpoint. Checks Apify's run status; when SUCCEEDED, fetches the
 * dataset, transforms each Instagram profile into a leads row (with dedup
 * against existing handles + business names), and updates the
 * discovery_runs record.
 *
 * Returns { status, apifyRunId, newLeads, skipped, errorMessage? }.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'
import { ApifyClient } from 'apify-client'
import type { Json } from '@shaq-os/database-types'

export const maxDuration = 60

interface RawProfileItem {
  username?: string
  fullName?: string
  biography?: string
  postsCount?: number
  followersCount?: number
  latestPosts?: Array<{
    displayUrl?: string
    url?: string
    caption?: string
    timestamp?: string
  }>
}

interface SkippedEntry {
  ig_handle: string
  reason: 'already_exists' | 'no_posts' | 'private' | 'insert_failed'
  detail?: string
}

function inferLocation(bio: string | undefined): string {
  if (!bio) return 'Singapore'
  if (/singapore|🇸🇬|\bsg\b/i.test(bio)) return 'Singapore'
  return 'Singapore'
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // Load the run; verify ownership via the SELECT policy.
  const { data: run, error: runErr } = await supabase
    .from('discovery_runs')
    .select('*')
    .eq('id', runId)
    .eq('owner_id', user.id)
    .single()
  if (runErr || !run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 })
  }

  // Terminal states — short-circuit.
  if (
    run.status === 'succeeded' ||
    run.status === 'failed' ||
    run.status === 'partial'
  ) {
    return NextResponse.json({
      status: run.status,
      apifyRunId: run.apify_run_id,
      newLeads: [], // already ingested on first SUCCEEDED poll; UI fetches /leads
      skipped: run.skipped ?? [],
      errorMessage: run.error_message,
      costUsd: run.cost_usd,
    })
  }

  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json(
      { error: 'APIFY_API_TOKEN not set' },
      { status: 503 }
    )
  }
  if (!run.apify_run_id) {
    return NextResponse.json(
      { error: 'discovery_run has no apify_run_id', status: run.status },
      { status: 500 }
    )
  }

  const client = new ApifyClient({ token: apifyToken })

  // Poll Apify.
  const apifyRun = await client.run(run.apify_run_id).get()
  if (!apifyRun) {
    return NextResponse.json(
      { error: 'apify run not found upstream', apifyRunId: run.apify_run_id },
      { status: 502 }
    )
  }

  if (
    apifyRun.status === 'READY' ||
    apifyRun.status === 'RUNNING' ||
    apifyRun.status === 'TIMING-OUT'
  ) {
    return NextResponse.json({
      status: 'running',
      apifyRunId: apifyRun.id,
      newLeads: [],
      skipped: [],
    })
  }

  if (apifyRun.status !== 'SUCCEEDED') {
    const msg = `apify run ${apifyRun.status}`
    await supabase
      .from('discovery_runs')
      .update({
        status: 'failed',
        error_message: msg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
    return NextResponse.json({
      status: 'failed',
      apifyRunId: apifyRun.id,
      errorMessage: msg,
      newLeads: [],
      skipped: [],
    })
  }

  // ---------- SUCCEEDED — ingest the dataset ----------
  const datasetId = apifyRun.defaultDatasetId
  if (!datasetId) {
    return NextResponse.json(
      { error: 'apify run succeeded but has no dataset', apifyRunId: apifyRun.id },
      { status: 502 }
    )
  }
  const { items } = await client.dataset(datasetId).listItems()
  const profiles = items as unknown as RawProfileItem[]

  const monthKey = new Date().toISOString().slice(0, 7).replace('-', '_')
  const source = `apify_ig_scraper_${monthKey}`

  const newLeadIds: string[] = []
  const newLeadSummary: { id: string; business_name: string; ig_handle: string }[] = []
  const skipped: SkippedEntry[] = []

  for (const item of profiles) {
    const username = item.username?.toLowerCase().trim()
    if (!username) continue

    const latestPosts = (item.latestPosts ?? []).filter(
      (p) => typeof p.displayUrl === 'string'
    )
    if (latestPosts.length === 0) {
      skipped.push({
        ig_handle: username,
        reason: 'no_posts',
        detail: 'profile may be private, empty, or scraping returned no posts',
      })
      continue
    }

    // Dedup by ig_handle OR business_name on the same owner.
    const businessName = (item.fullName || username).slice(0, 200)
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('owner_id', user.id)
      .or(`ig_handle.eq.${username},business_name.eq.${businessName}`)
      .limit(1)
      .maybeSingle()
    if (existing) {
      skipped.push({
        ig_handle: username,
        reason: 'already_exists',
        detail: `lead ${existing.id} already covers @${username}`,
      })
      continue
    }

    const latestPostImageUrls = latestPosts
      .slice(0, 12)
      .map((p) => p.displayUrl as string)

    const discoveryMetadata: Json = {
      actor: 'apify/instagram-profile-scraper',
      apify_run_id: apifyRun.id,
      followers_count: item.followersCount ?? null,
      posts_count: item.postsCount ?? null,
      bio: item.biography ?? null,
      latest_post_image_urls: latestPostImageUrls,
    } as unknown as Json

    const { data: leadRow, error: leadErr } = await supabase
      .from('leads')
      .insert({
        owner_id: user.id,
        business_name: businessName,
        ig_handle: username,
        location: inferLocation(item.biography),
        status: 'new',
        discovery_source: source,
        discovery_metadata: discoveryMetadata,
        diagnosis: {} as unknown as Json,
      })
      .select('id, business_name, ig_handle')
      .single()

    if (leadErr || !leadRow) {
      skipped.push({
        ig_handle: username,
        reason: 'insert_failed',
        detail: leadErr?.message ?? 'unknown insert error',
      })
      continue
    }
    newLeadIds.push(leadRow.id)
    newLeadSummary.push({
      id: leadRow.id,
      business_name: leadRow.business_name,
      ig_handle: leadRow.ig_handle ?? username,
    })
  }

  // Status logic — Apify itself succeeded, and we attempted ingest:
  //   - Some new inserted + some skipped → 'partial'
  //   - All new inserted, no skips → 'succeeded'
  //   - Zero new, all skips dedup/no_posts → 'succeeded' (happy path —
  //     dedup correctly identified everything as duplicates)
  //   - Zero new AND any insert_failed → 'failed'
  const hasInsertFailures = skipped.some((s) => s.reason === 'insert_failed')
  const finalStatus =
    newLeadIds.length > 0
      ? skipped.length > 0
        ? 'partial'
        : 'succeeded'
      : hasInsertFailures
        ? 'failed'
        : 'succeeded'

  await supabase
    .from('discovery_runs')
    .update({
      status: finalStatus,
      lead_ids: newLeadIds,
      skipped: skipped as unknown as Json,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)

  return NextResponse.json({
    status: finalStatus,
    apifyRunId: apifyRun.id,
    newLeads: newLeadSummary,
    skipped,
  })
}
