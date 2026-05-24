/**
 * GET /api/leads/discover/[runId] — Plan 04B + Plan 13
 *
 * Poll endpoint. Checks Apify's run status; when SUCCEEDED, ingests the
 * dataset by mode:
 *   - ig_handles: each IG profile → leads row with latest_post_image_urls
 *   - maps_category: each Google Maps place → ICP scored → only score ≥
 *     minIcpScore lands as a lead
 *
 * Returns { status, apifyRunId, newLeads, skipped, errorMessage? }.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'
import { ApifyClient } from 'apify-client'
import { z } from 'zod'
import { ICP_SCORER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import { callAnthropicTool } from '@/lib/anthropic-tool'
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

function inferLocation(bio: string | undefined): string {
  if (!bio) return 'Singapore'
  if (/singapore|🇸🇬|\bsg\b/i.test(bio)) return 'Singapore'
  return 'Singapore'
}

// Quick chain denylist — these are too big to be ICP and clog Maps results.
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
  "din tai fung",
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

async function scoreMapsLead(item: RawMapsItem): Promise<IcpScore | null> {
  const lines = [
    `BUSINESS NAME: ${item.title}`,
    item.address ? `Address: ${item.address}` : null,
    item.website ? `Website: ${item.website}` : null,
    item.phone ? `Phone: ${item.phone}` : null,
    item.categoryName ? `Maps category: ${item.categoryName}` : null,
    Array.isArray(item.categories) && item.categories.length
      ? `Other categories: ${item.categories.join(', ')}`
      : null,
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
      userContent: `Score this discovered business against the ICP.\n\n${lines}\n\nReturn the verdict.`,
      toolName: 'submit_icp_score',
      schema: IcpScoreSchema,
      maxTokens: 1500,
    })
  } catch {
    return null
  }
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

  const datasetId = apifyRun.defaultDatasetId
  if (!datasetId) {
    return NextResponse.json(
      { error: 'apify run succeeded but has no dataset', apifyRunId: apifyRun.id },
      { status: 502 }
    )
  }
  const { items } = await client.dataset(datasetId).listItems()

  const monthKey = new Date().toISOString().slice(0, 7).replace('-', '_')
  const newLeadIds: string[] = []
  const newLeadSummary: {
    id: string
    business_name: string
    ig_handle: string
    icpScore?: number
  }[] = []
  const skipped: SkippedEntry[] = []

  // ============= mode dispatch =============
  if (run.mode === 'ig_handles') {
    const profiles = items as unknown as RawProfileItem[]
    const source = `apify_ig_scraper_${monthKey}`

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
  } else if (run.mode === 'maps_category') {
    const places = items as unknown as RawMapsItem[]
    const source = `apify_maps_${monthKey}`
    const input = (run.input ?? {}) as {
      minReviews?: number
      minIcpScore?: number
    }
    const minReviews = input.minReviews ?? 50
    const minIcpScore = input.minIcpScore ?? 6

    // Pre-filter: must have title, reviews >= threshold, website, not a chain.
    const survivors: RawMapsItem[] = []
    for (const item of places) {
      const title = (item.title ?? '').trim()
      if (!title) {
        skipped.push({ ig_handle: '(no_title)', reason: 'no_title' })
        continue
      }
      if (typeof item.reviewsCount === 'number' && item.reviewsCount < minReviews) {
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
      survivors.push(item)
    }

    // Parallel ICP scoring with concurrency limit 4.
    const scored: { item: RawMapsItem; score: IcpScore | null }[] = []
    const chunkSize = 4
    for (let i = 0; i < survivors.length; i += chunkSize) {
      const batch = survivors.slice(i, i + chunkSize)
      const results = await Promise.all(
        batch.map(async (item) => ({
          item,
          score: await scoreMapsLead(item),
        }))
      )
      scored.push(...results)
    }

    // Insert only those meeting threshold.
    for (const { item, score } of scored) {
      const title = (item.title ?? '').trim()
      if (!score) {
        skipped.push({
          ig_handle: title,
          reason: 'scorer_error',
          detail: 'Anthropic call failed (timeout or 5xx) — re-run to retry',
        })
        continue
      }
      if (score.score < minIcpScore) {
        skipped.push({
          ig_handle: title,
          reason: 'low_icp_score',
          detail: `score ${score.score}/10 (${score.tier}) — ${score.disqualifiers.join('; ').slice(0, 200)}`,
        })
        continue
      }
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('owner_id', user.id)
        .eq('business_name', title)
        .limit(1)
        .maybeSingle()
      if (existing) {
        skipped.push({
          ig_handle: title,
          reason: 'already_exists',
          detail: `lead ${existing.id} already covers "${title}"`,
        })
        continue
      }

      const discoveryMetadata: Json = {
        actor: 'compass/crawler-google-places',
        apify_run_id: apifyRun.id,
        google_review_count: item.reviewsCount ?? null,
        google_rating: item.totalScore ?? null,
        address: item.address ?? null,
        phone: item.phone ?? null,
        maps_url: item.url ?? null,
        category: item.categoryName ?? null,
        categories: item.categories ?? [],
      } as unknown as Json

      const diagnosisWithScore: Json = {
        icpScore: { ...score, scoredAt: new Date().toISOString() },
      } as unknown as Json

      const { data: leadRow, error: leadErr } = await supabase
        .from('leads')
        .insert({
          owner_id: user.id,
          business_name: title,
          ig_handle: null,
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
          ig_handle: title,
          reason: 'insert_failed',
          detail: leadErr?.message ?? 'unknown',
        })
        continue
      }
      newLeadIds.push(leadRow.id)
      newLeadSummary.push({
        id: leadRow.id,
        business_name: leadRow.business_name,
        ig_handle: '',
        icpScore: score.score,
      })
    }
  }

  // Status logic — Apify itself succeeded. Only truly fail if EVERY
  // skip was a real insert_failed. Scorer rejecting all candidates is a
  // valid 'succeeded' (UI shows the reason). Same for all-dedup matches.
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
    .eq('id', runId)

  return NextResponse.json({
    status: finalStatus,
    apifyRunId: apifyRun.id,
    newLeads: newLeadSummary,
    skipped,
  })
}
