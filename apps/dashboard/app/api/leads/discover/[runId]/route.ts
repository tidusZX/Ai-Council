/**
 * GET /api/leads/discover/[runId] — Plan 04B + Plan 13 + Plan 13C
 *
 * Poll endpoint. Multi-stage state machine for maps_category mode:
 *
 *   1. apify_maps_running  → wait for Apify Google Maps Actor
 *   2. extracting_handles  → pre-filter, extract IG handles from Maps fields
 *                            kick off Apify IG Profile Scraper for found handles
 *   3. apify_ig_running    → wait for IG Profile Scraper
 *   4. ready_to_score      → vision-score IG-equipped survivors,
 *                            metadata-score the rest, insert qualifying leads
 *   5. succeeded / partial / failed (terminal)
 *
 * Each poll progresses ONE stage (or returns "still running" within a stage),
 * keeping every request inside Vercel's 60s function cap.
 *
 * State lives in discovery_run.input. ig_handles mode is unchanged from
 * Phase 1 — it's a single-stage flow that completes on the first SUCCEEDED
 * poll.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'
import { ApifyClient } from 'apify-client'
import { z } from 'zod'
import { ICP_SCORER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import { callAnthropicTool } from '@/lib/anthropic-tool'
import type { Json } from '@shaq-os/database-types'

export const maxDuration = 60

const IG_PROFILE_ACTOR = 'apify/instagram-profile-scraper'

// ============================================================================
// Types
// ============================================================================

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

interface SocialProfileEntry {
  url?: string
  platform?: string
}

interface RawMapsItem {
  title?: string
  address?: string
  totalScore?: number
  reviewsCount?: number
  url?: string
  website?: string
  phone?: string
  categoryName?: string
  categories?: string[]
  description?: string
  additionalInfo?: Record<string, unknown>
  // Apify's Google Maps scraper sometimes returns social links — field
  // shapes vary by Actor version. Check multiple paths defensively.
  socialProfiles?: SocialProfileEntry[] | Record<string, string>
  instagram?: string
  socialLinks?: Record<string, string>
}

interface SkippedEntry {
  ig_handle: string
  reason:
    | 'already_exists'
    | 'no_posts'
    | 'private'
    | 'insert_failed'
    | 'low_reviews'
    | 'no_website'
    | 'chain_detected'
    | 'low_icp_score'
    | 'scorer_error'
    | 'no_title'
  detail?: string
}

const IcpScoreSchema = z.object({
  score: z.number().int().min(1).max(10),
  tier: z.enum(['first_call', 'strong', 'maybe', 'unlikely', 'disqualified']),
  fitReasons: z.array(z.string().min(3).max(300)).min(1).max(5),
  disqualifiers: z.array(z.string().min(3).max(300)).max(5).default([]),
  suggestedAction: z.enum([
    'pursue',
    'pursue_after_signal',
    'watch',
    'archive',
  ]),
  rationale: z.string().min(20).max(800),
  evidenceUsed: z.object({
    sizeSignal: z.string().min(3).max(200),
    photographyState: z.string().min(3).max(200),
    icpVerticalMatch: z.string().min(3).max(200),
  }),
})
type IcpScore = z.infer<typeof IcpScoreSchema>

// ============================================================================
// Helpers
// ============================================================================

function inferLocation(bio: string | undefined): string {
  if (!bio) return 'Singapore'
  if (/singapore|🇸🇬|\bsg\b/i.test(bio)) return 'Singapore'
  return 'Singapore'
}

const CHAIN_DENYLIST = [
  'starbucks',
  'mcdonald',
  "mcdonald's",
  'burger king',
  'kfc',
  'subway',
  'pizza hut',
  'domino',
  'cold storage',
  'fairprice',
  'ntuc',
  '7-eleven',
  'cheers',
  'toast box',
  'breadtalk',
  'ya kun',
  'crystal jade',
  'din tai fung',
  'paradise group',
  'jumbo',
  'tung lok',
  'jollibee',
  'texas chicken',
]

function isChain(title: string): boolean {
  const lower = title.toLowerCase()
  return CHAIN_DENYLIST.some((c) => lower.includes(c))
}

/**
 * Try to extract an IG handle from a Google Maps Actor result. Apify's
 * shape varies between Actor versions; check multiple paths defensively.
 * Returns the normalized handle (no @, lowercase) or null.
 */
function extractIgHandle(item: RawMapsItem): string | null {
  const candidates: string[] = []
  if (typeof item.instagram === 'string') candidates.push(item.instagram)
  if (item.socialLinks) {
    for (const v of Object.values(item.socialLinks)) {
      if (typeof v === 'string') candidates.push(v)
    }
  }
  if (Array.isArray(item.socialProfiles)) {
    for (const p of item.socialProfiles) {
      if (p?.url) candidates.push(p.url)
    }
  } else if (item.socialProfiles && typeof item.socialProfiles === 'object') {
    for (const v of Object.values(item.socialProfiles)) {
      if (typeof v === 'string') candidates.push(v)
    }
  }
  if (typeof item.description === 'string') candidates.push(item.description)

  for (const raw of candidates) {
    const m = raw.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i)
    if (m) {
      const handle = m[1].toLowerCase().replace(/\/$/, '')
      // Filter out non-profile paths.
      if (
        handle &&
        !['p', 'reel', 'reels', 'tv', 'stories', 'explore'].includes(handle)
      ) {
        return handle
      }
    }
  }
  return null
}

function calcCadence(timestamps: (string | undefined)[]): {
  postsPerWeek: number | null
  lastPostAgeDays: number | null
} {
  const valid = timestamps
    .filter((t): t is string => typeof t === 'string')
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)
  if (valid.length < 2) {
    return {
      postsPerWeek: null,
      lastPostAgeDays:
        valid.length === 1
          ? Math.floor((Date.now() - valid[0]) / (1000 * 60 * 60 * 24))
          : null,
    }
  }
  const newest = valid[0]
  const oldest = valid[valid.length - 1]
  const spanDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24))
  return {
    postsPerWeek: (valid.length / spanDays) * 7,
    lastPostAgeDays: Math.floor((Date.now() - newest) / (1000 * 60 * 60 * 24)),
  }
}

async function scoreMapsMetadataOnly(
  item: RawMapsItem
): Promise<IcpScore | null> {
  const lines = [
    `BUSINESS NAME: ${item.title}`,
    item.address ? `Address: ${item.address}` : null,
    item.website ? `Website: ${item.website}` : null,
    item.phone ? `Phone: ${item.phone}` : null,
    item.categoryName ? `Maps category: ${item.categoryName}` : null,
    typeof item.reviewsCount === 'number'
      ? `Google reviews: ${item.reviewsCount}`
      : null,
    typeof item.totalScore === 'number'
      ? `Google rating: ${item.totalScore.toFixed(1)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    return await callAnthropicTool({
      system: ICP_SCORER_SYSTEM_PROMPT,
      userContent: `Score this business against the ICP (Maps metadata only — no IG visuals or cadence).\n\n${lines}\n\nReturn the verdict.`,
      toolName: 'submit_icp_score',
      schema: IcpScoreSchema,
      maxTokens: 1500,
    })
  } catch {
    return null
  }
}

async function scoreWithVision(
  item: RawMapsItem,
  profile: RawProfileItem
): Promise<IcpScore | null> {
  const latestPosts = (profile.latestPosts ?? []).filter(
    (p) => typeof p.displayUrl === 'string'
  )
  const imageUrls = latestPosts.slice(0, 12).map((p) => p.displayUrl as string)
  const { postsPerWeek, lastPostAgeDays } = calcCadence(
    latestPosts.map((p) => p.timestamp)
  )

  const linesRaw: (string | null)[] = [
    `BUSINESS NAME: ${item.title}`,
    profile.username ? `IG: @${profile.username}` : null,
    profile.fullName ? `IG display name: ${profile.fullName}` : null,
    item.website ? `Website: ${item.website}` : null,
    profile.biography ? `IG bio: ${profile.biography.slice(0, 300)}` : null,
    item.categoryName ? `Maps category: ${item.categoryName}` : null,
    typeof item.reviewsCount === 'number'
      ? `Google reviews: ${item.reviewsCount}`
      : null,
    typeof profile.followersCount === 'number'
      ? `IG followers: ${profile.followersCount.toLocaleString()}`
      : null,
    typeof profile.postsCount === 'number'
      ? `IG total posts: ${profile.postsCount.toLocaleString()}`
      : null,
    postsPerWeek !== null
      ? `Posting cadence: ${postsPerWeek.toFixed(1)} posts/week`
      : null,
    lastPostAgeDays !== null ? `Last post: ${lastPostAgeDays} days ago` : null,
    imageUrls.length > 0
      ? `Showing ${imageUrls.length} recent post images via vision. Judge actual photography quality from what you see, not metadata inferences.`
      : null,
  ]
  const lines = linesRaw.filter((l): l is string => l !== null).join('\n')

  try {
    return await callAnthropicTool({
      system: ICP_SCORER_SYSTEM_PROMPT,
      userContent: `Score this business against the ICP. You have IG visuals + cadence — use them as primary signal.\n\n${lines}\n\nReturn the verdict.`,
      toolName: 'submit_icp_score',
      schema: IcpScoreSchema,
      imageUrls,
      maxTokens: 2048,
    })
  } catch {
    return null
  }
}

interface MapsStateInput {
  stage?:
    | 'apify_maps_running'
    | 'extracting_handles'
    | 'apify_ig_running'
    | 'ready_to_score'
  category?: string
  minReviews?: number
  minIcpScore?: number
  survivors_with_ig?: Array<{ handle: string; item: RawMapsItem }>
  survivors_without_ig?: RawMapsItem[]
  apify_ig_run_id?: string
}

// ============================================================================
// Route
// ============================================================================

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

  const { data: run, error: runErr } = await supabase
    .from('discovery_runs')
    .select('*')
    .eq('id', runId)
    .eq('owner_id', user.id)
    .single()
  if (runErr || !run) {
    return NextResponse.json({ error: 'run not found' }, { status: 404 })
  }

  // Terminal states.
  if (
    run.status === 'succeeded' ||
    run.status === 'failed' ||
    run.status === 'partial'
  ) {
    return NextResponse.json({
      status: run.status,
      apifyRunId: run.apify_run_id,
      newLeads: [],
      skipped: run.skipped ?? [],
      errorMessage: run.error_message,
      costUsd: run.cost_usd,
    })
  }

  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json({ error: 'APIFY_API_TOKEN not set' }, { status: 503 })
  }
  if (!run.apify_run_id) {
    return NextResponse.json(
      { error: 'discovery_run has no apify_run_id', status: run.status },
      { status: 500 }
    )
  }

  const apifyClient = new ApifyClient({ token: apifyToken })

  // =========================================================================
  // ig_handles mode — single-stage flow unchanged from Phase 1
  // =========================================================================
  if (run.mode === 'ig_handles') {
    return handleIgHandlesMode(run, supabase, apifyClient)
  }

  // =========================================================================
  // maps_category mode — multi-stage chain (Plan 13C)
  // =========================================================================
  return handleMapsCategoryMode(run, supabase, apifyClient, user.id)
}

// ============================================================================
// ig_handles handler (unchanged)
// ============================================================================
async function handleIgHandlesMode(
  run: {
    id: string
    apify_run_id: string | null
    mode: string
  },
  supabase: Awaited<ReturnType<typeof createClient>>,
  apifyClient: ApifyClient
) {
  const apifyRun = await apifyClient.run(run.apify_run_id!).get()
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
      stage: 'apify_ig_running',
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
      .eq('id', run.id)
    return NextResponse.json({
      status: 'failed',
      apifyRunId: apifyRun.id,
      errorMessage: msg,
      newLeads: [],
      skipped: [],
    })
  }

  const datasetId = apifyRun.defaultDatasetId
  if (!datasetId) {
    return NextResponse.json(
      { error: 'apify run succeeded but has no dataset', apifyRunId: apifyRun.id },
      { status: 502 }
    )
  }
  const { items } = await apifyClient.dataset(datasetId).listItems()
  const profiles = items as unknown as RawProfileItem[]
  const monthKey = new Date().toISOString().slice(0, 7).replace('-', '_')
  const source = `apify_ig_scraper_${monthKey}`

  // Get owner from the run row.
  const { data: ownerRow } = await supabase
    .from('discovery_runs')
    .select('owner_id')
    .eq('id', run.id)
    .single()
  const ownerId = ownerRow?.owner_id
  if (!ownerId) {
    return NextResponse.json({ error: 'no owner on run' }, { status: 500 })
  }

  const newLeadIds: string[] = []
  const newLeadSummary: {
    id: string
    business_name: string
    ig_handle: string
  }[] = []
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

    const businessName = (item.fullName || username).slice(0, 200)
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('owner_id', ownerId)
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
        owner_id: ownerId,
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
        detail: leadErr?.message ?? 'unknown',
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

  const insertFailures = skipped.filter((s) => s.reason === 'insert_failed').length
  const finalStatus =
    newLeadIds.length > 0
      ? skipped.length > 0
        ? 'partial'
        : 'succeeded'
      : skipped.length > 0 && insertFailures === skipped.length
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
    .eq('id', run.id)

  return NextResponse.json({
    status: finalStatus,
    apifyRunId: apifyRun.id,
    newLeads: newLeadSummary,
    skipped,
  })
}

// ============================================================================
// maps_category handler (multi-stage)
// ============================================================================
async function handleMapsCategoryMode(
  run: {
    id: string
    apify_run_id: string | null
    input: unknown
    mode: string
    skipped: unknown
    lead_ids: string[]
  },
  supabase: Awaited<ReturnType<typeof createClient>>,
  apifyClient: ApifyClient,
  ownerId: string
) {
  const input = (run.input ?? {}) as MapsStateInput
  const stage = input.stage ?? 'apify_maps_running'

  // ---------------------------------------------------------------
  // STAGE A — apify_maps_running: wait for Apify Maps to finish
  // ---------------------------------------------------------------
  if (stage === 'apify_maps_running') {
    const apifyRun = await apifyClient.run(run.apify_run_id!).get()
    if (!apifyRun) {
      return NextResponse.json(
        { error: 'apify maps run not found', apifyRunId: run.apify_run_id },
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
        stage,
        apifyRunId: apifyRun.id,
        progressMessage: 'Apify Google Maps is scanning…',
        newLeads: [],
        skipped: [],
      })
    }
    if (apifyRun.status !== 'SUCCEEDED') {
      const msg = `apify maps run ${apifyRun.status}`
      await supabase
        .from('discovery_runs')
        .update({
          status: 'failed',
          error_message: msg,
          completed_at: new Date().toISOString(),
        })
        .eq('id', run.id)
      return NextResponse.json({
        status: 'failed',
        stage,
        apifyRunId: apifyRun.id,
        errorMessage: msg,
        newLeads: [],
        skipped: [],
      })
    }

    // Maps done — fetch dataset, pre-filter, extract handles, kick off IG run.
    const datasetId = apifyRun.defaultDatasetId
    if (!datasetId) {
      return NextResponse.json(
        { error: 'maps run succeeded but has no dataset' },
        { status: 502 }
      )
    }
    const { items } = await apifyClient.dataset(datasetId).listItems()
    const places = items as unknown as RawMapsItem[]
    const minReviews = input.minReviews ?? 50

    const skipped: SkippedEntry[] = []
    const survivors_with_ig: Array<{ handle: string; item: RawMapsItem }> = []
    const survivors_without_ig: RawMapsItem[] = []

    for (const item of places) {
      const title = (item.title ?? '').trim()
      if (!title) {
        skipped.push({ ig_handle: '(no_title)', reason: 'no_title' })
        continue
      }
      if (
        typeof item.reviewsCount === 'number' &&
        item.reviewsCount < minReviews
      ) {
        skipped.push({
          ig_handle: title,
          reason: 'low_reviews',
          detail: `${item.reviewsCount} reviews < ${minReviews}`,
        })
        continue
      }
      if (!item.website) {
        skipped.push({
          ig_handle: title,
          reason: 'no_website',
          detail: 'no website signal — likely too small',
        })
        continue
      }
      if (isChain(title)) {
        skipped.push({
          ig_handle: title,
          reason: 'chain_detected',
          detail: 'matches known SG chain denylist',
        })
        continue
      }
      const igHandle = extractIgHandle(item)
      if (igHandle) {
        survivors_with_ig.push({ handle: igHandle, item })
      } else {
        survivors_without_ig.push(item)
      }
    }

    // Trigger Apify IG Profile Scraper for handles we found.
    let apifyIgRunId: string | undefined
    if (survivors_with_ig.length > 0) {
      try {
        const handles = Array.from(new Set(survivors_with_ig.map((s) => s.handle)))
        const igRun = await apifyClient.actor(IG_PROFILE_ACTOR).start({
          usernames: handles,
          resultsLimit: 12,
        })
        apifyIgRunId = igRun.id
      } catch {
        // If kicking off IG run fails, everything falls back to metadata-only.
        survivors_without_ig.push(...survivors_with_ig.map((s) => s.item))
        survivors_with_ig.length = 0
      }
    }

    const newInput: MapsStateInput = {
      ...input,
      stage: apifyIgRunId ? 'apify_ig_running' : 'ready_to_score',
      survivors_with_ig,
      survivors_without_ig,
      apify_ig_run_id: apifyIgRunId,
    }
    await supabase
      .from('discovery_runs')
      .update({
        input: newInput as unknown as Json,
        skipped: skipped as unknown as Json,
      })
      .eq('id', run.id)

    return NextResponse.json({
      status: 'running',
      stage: newInput.stage,
      apifyRunId: run.apify_run_id,
      apifyIgRunId,
      progressMessage: apifyIgRunId
        ? `Maps done. ${survivors_with_ig.length} businesses with IG handles, ${survivors_without_ig.length} without. Scraping IG profiles…`
        : `Maps done. No IG handles extractable — scoring on metadata only.`,
      newLeads: [],
      skipped,
    })
  }

  // ---------------------------------------------------------------
  // STAGE B — apify_ig_running: wait for IG profile scrape
  // ---------------------------------------------------------------
  if (stage === 'apify_ig_running') {
    if (!input.apify_ig_run_id) {
      // Shouldn't happen — repair: skip to score stage.
      const newInput: MapsStateInput = { ...input, stage: 'ready_to_score' }
      await supabase
        .from('discovery_runs')
        .update({ input: newInput as unknown as Json })
        .eq('id', run.id)
      return NextResponse.json({
        status: 'running',
        stage: newInput.stage,
        progressMessage: 'No IG run to wait on — scoring now…',
        newLeads: [],
        skipped: run.skipped ?? [],
      })
    }
    const igRun = await apifyClient.run(input.apify_ig_run_id).get()
    if (!igRun) {
      return NextResponse.json(
        { error: 'apify ig run not found upstream' },
        { status: 502 }
      )
    }
    if (
      igRun.status === 'READY' ||
      igRun.status === 'RUNNING' ||
      igRun.status === 'TIMING-OUT'
    ) {
      return NextResponse.json({
        status: 'running',
        stage,
        apifyRunId: run.apify_run_id,
        apifyIgRunId: igRun.id,
        progressMessage: `IG profile scrape in progress (${(input.survivors_with_ig ?? []).length} handles)…`,
        newLeads: [],
        skipped: run.skipped ?? [],
      })
    }
    // IG done (succeeded or otherwise). Move to scoring regardless — if it
    // failed, those survivors just fall back to metadata.
    const newInput: MapsStateInput = { ...input, stage: 'ready_to_score' }
    await supabase
      .from('discovery_runs')
      .update({ input: newInput as unknown as Json })
      .eq('id', run.id)
    return NextResponse.json({
      status: 'running',
      stage: newInput.stage,
      progressMessage: 'IG scrape complete. Scoring…',
      newLeads: [],
      skipped: run.skipped ?? [],
    })
  }

  // ---------------------------------------------------------------
  // STAGE C — ready_to_score: vision-score survivors_with_ig,
  //                            metadata-score survivors_without_ig
  // ---------------------------------------------------------------
  const survivors_with_ig = input.survivors_with_ig ?? []
  const survivors_without_ig = input.survivors_without_ig ?? []
  const minIcpScore = input.minIcpScore ?? 6
  const skipped: SkippedEntry[] = ((run.skipped as unknown) as SkippedEntry[]) ?? []
  const newLeadIds: string[] = []
  const newLeadSummary: {
    id: string
    business_name: string
    ig_handle: string
    icpScore?: number
  }[] = []
  const monthKey = new Date().toISOString().slice(0, 7).replace('-', '_')
  const source = `apify_maps_${monthKey}`

  // Fetch IG profiles if we had a run.
  const profilesByHandle = new Map<string, RawProfileItem>()
  if (input.apify_ig_run_id) {
    try {
      const igRun = await apifyClient.run(input.apify_ig_run_id).get()
      if (igRun?.status === 'SUCCEEDED' && igRun.defaultDatasetId) {
        const { items } = await apifyClient
          .dataset(igRun.defaultDatasetId)
          .listItems()
        for (const it of items as unknown as RawProfileItem[]) {
          if (it.username) {
            profilesByHandle.set(it.username.toLowerCase(), it)
          }
        }
      }
    } catch {
      // proceed without profiles — falls back to metadata
    }
  }

  // Score vision-equipped survivors in parallel batches of 3.
  const visionScored: { handle: string; item: RawMapsItem; score: IcpScore | null }[] = []
  for (let i = 0; i < survivors_with_ig.length; i += 3) {
    const batch = survivors_with_ig.slice(i, i + 3)
    const results = await Promise.all(
      batch.map(async ({ handle, item }) => {
        const profile = profilesByHandle.get(handle)
        if (!profile) {
          // No profile data — degrade to metadata-only.
          const score = await scoreMapsMetadataOnly(item)
          return { handle, item, score }
        }
        const score = await scoreWithVision(item, profile)
        return { handle, item, score }
      })
    )
    visionScored.push(...results)
  }

  // Score metadata-only survivors in parallel batches of 4.
  const metadataScored: { handle: null; item: RawMapsItem; score: IcpScore | null }[] = []
  for (let i = 0; i < survivors_without_ig.length; i += 4) {
    const batch = survivors_without_ig.slice(i, i + 4)
    const results = await Promise.all(
      batch.map(async (item) => ({
        handle: null,
        item,
        score: await scoreMapsMetadataOnly(item),
      }))
    )
    metadataScored.push(...results)
  }

  // Insert qualifying leads.
  const allScored: { handle: string | null; item: RawMapsItem; score: IcpScore | null }[] =
    [...visionScored, ...metadataScored]
  for (const { handle, item, score } of allScored) {
    const title = (item.title ?? '').trim()
    if (!score) {
      skipped.push({
        ig_handle: title,
        reason: 'scorer_error',
        detail: 'Anthropic call failed (timeout/5xx)',
      })
      continue
    }
    if (score.score < minIcpScore) {
      skipped.push({
        ig_handle: title,
        reason: 'low_icp_score',
        detail: `${score.score}/10 (${score.tier}) — ${score.disqualifiers.join('; ').slice(0, 200)}`,
      })
      continue
    }
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('owner_id', ownerId)
      .or(
        handle
          ? `ig_handle.eq.${handle},business_name.eq.${title}`
          : `business_name.eq.${title}`
      )
      .limit(1)
      .maybeSingle()
    if (existing) {
      skipped.push({
        ig_handle: handle ?? title,
        reason: 'already_exists',
        detail: `lead ${existing.id} already covers "${title}"`,
      })
      continue
    }

    const profile = handle ? profilesByHandle.get(handle) : undefined
    const latestPostImageUrls = profile
      ? (profile.latestPosts ?? [])
          .filter((p) => typeof p.displayUrl === 'string')
          .slice(0, 12)
          .map((p) => p.displayUrl as string)
      : []
    const { postsPerWeek, lastPostAgeDays } = profile
      ? calcCadence((profile.latestPosts ?? []).map((p) => p.timestamp))
      : { postsPerWeek: null, lastPostAgeDays: null }

    const discoveryMetadata: Json = {
      actor: 'compass/crawler-google-places',
      apify_run_id: run.apify_run_id,
      google_review_count: item.reviewsCount ?? null,
      google_rating: item.totalScore ?? null,
      address: item.address ?? null,
      phone: item.phone ?? null,
      maps_url: item.url ?? null,
      category: item.categoryName ?? null,
      categories: item.categories ?? [],
      ...(handle
        ? {
            ig_followers_count: profile?.followersCount ?? null,
            ig_posts_count: profile?.postsCount ?? null,
            ig_bio: profile?.biography ?? null,
            latest_post_image_urls: latestPostImageUrls,
            posts_per_week: postsPerWeek,
            last_post_age_days: lastPostAgeDays,
            ig_chained_at: new Date().toISOString(),
          }
        : {}),
    } as unknown as Json

    const diagnosisWithScore: Json = {
      icpScore: {
        ...score,
        scoredAt: new Date().toISOString(),
        withVision: handle != null && profile != null,
      },
    } as unknown as Json

    const { data: leadRow, error: leadErr } = await supabase
      .from('leads')
      .insert({
        owner_id: ownerId,
        business_name: title,
        ig_handle: handle ?? null,
        website: item.website ?? null,
        location: item.address ?? 'Singapore',
        status: 'new',
        discovery_source: source,
        discovery_metadata: discoveryMetadata,
        diagnosis: diagnosisWithScore,
        opportunity_score: score.score * 10,
      })
      .select('id, business_name')
      .single()
    if (leadErr || !leadRow) {
      skipped.push({
        ig_handle: handle ?? title,
        reason: 'insert_failed',
        detail: leadErr?.message ?? 'unknown',
      })
      continue
    }
    newLeadIds.push(leadRow.id)
    newLeadSummary.push({
      id: leadRow.id,
      business_name: leadRow.business_name,
      ig_handle: handle ?? '',
      icpScore: score.score,
    })
  }

  const insertFailures = skipped.filter((s) => s.reason === 'insert_failed').length
  const finalStatus =
    newLeadIds.length > 0
      ? skipped.length > 0
        ? 'partial'
        : 'succeeded'
      : skipped.length > 0 && insertFailures === skipped.length
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
    .eq('id', run.id)

  return NextResponse.json({
    status: finalStatus,
    apifyRunId: run.apify_run_id,
    apifyIgRunId: input.apify_ig_run_id,
    newLeads: newLeadSummary,
    skipped,
  })
}
