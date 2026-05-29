/**
 * POST /api/leads/[id]/score-with-ig — Plan 13B
 *
 * The vision-aware scoring path. Closes the gap where the metadata-only
 * scorer false-disqualified d.o.c-class leads that look like real
 * candidates on actual IG.
 *
 * Flow:
 *   1. Resolve IG handle (body.igHandle OR lead.ig_handle)
 *   2. Synchronously trigger Apify Instagram Profile Scraper (≈30-50s)
 *   3. Build cadence info from latestPosts[].timestamp
 *   4. Pass post image URLs + cadence into the ICP scorer via vision
 *   5. Persist verdict to lead.diagnosis.icpScore +
 *      lead.discovery_metadata.latest_post_image_urls + cadence_per_week
 *      Set opportunity_score = verdict.score (1-10).
 *
 * Body: { igHandle?: string, postsToFetch?: number = 12 }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { ICP_SCORER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import { callAnthropicTool } from '@/lib/anthropic-tool'
import { ApifyClient } from 'apify-client'
import type { Json } from '@shaq-os/database-types'

export const maxDuration = 120

const Body = z.object({
  igHandle: z.string().min(1).max(60).optional(),
  postsToFetch: z.number().int().min(3).max(24).default(12),
})

const ResultSchema = z.object({
  score: z.number().int().min(1).max(10),
  tier: z.enum(['first_call', 'strong', 'maybe', 'unlikely', 'disqualified']),
  fitReasons: z.array(z.string().min(3).max(300)).min(1).max(5),
  disqualifiers: z.array(z.string().min(3).max(300)).max(5).default([]),
  suggestedAction: z.enum(['pursue', 'pursue_after_signal', 'watch', 'archive']),
  rationale: z.string().min(20).max(800),
  evidenceUsed: z.object({
    sizeSignal: z.string().min(3).max(200),
    photographyState: z.string().min(3).max(200),
    icpVerticalMatch: z.string().min(3).max(200),
  }),
})

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

function calcCadence(
  timestamps: (string | undefined)[]
): { postsPerWeek: number | null; lastPostAgeDays: number | null } {
  const valid = timestamps
    .filter((t): t is string => typeof t === 'string')
    .map((t) => new Date(t).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a) // newest first
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
  const postsPerWeek = (valid.length / spanDays) * 7
  const lastPostAgeDays = Math.floor(
    (Date.now() - newest) / (1000 * 60 * 60 * 24)
  )
  return { postsPerWeek, lastPostAgeDays }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
  const { igHandle: bodyHandle, postsToFetch } = parsed.data

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()
  if (leadErr || !lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }

  const igHandle = (bodyHandle ?? lead.ig_handle ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase()
  if (!igHandle) {
    return NextResponse.json(
      {
        error: 'no IG handle — pass one in the body or set lead.ig_handle first',
      },
      { status: 400 }
    )
  }

  const apifyToken = process.env.APIFY_API_TOKEN
  if (!apifyToken) {
    return NextResponse.json(
      { error: 'APIFY_API_TOKEN not set' },
      { status: 503 }
    )
  }

  // --- Synchronous Apify call ---
  const apifyClient = new ApifyClient({ token: apifyToken })
  let profileItem: RawProfileItem | null = null
  try {
    const run = await apifyClient
      .actor('apify/instagram-profile-scraper')
      .call(
        {
          usernames: [igHandle],
          resultsLimit: postsToFetch,
        },
        { waitSecs: 90 }
      )
    if (run.status !== 'SUCCEEDED') {
      return NextResponse.json(
        {
          error: `Apify IG scrape ${run.status.toLowerCase()}`,
          apifyRunId: run.id,
        },
        { status: 502 }
      )
    }
    const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems()
    const arr = items as unknown as RawProfileItem[]
    profileItem = arr.find((it) => it.username?.toLowerCase() === igHandle) ?? arr[0] ?? null
    if (!profileItem) {
      return NextResponse.json(
        { error: 'apify returned no profile for handle' },
        { status: 404 }
      )
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'apify IG scrape failed', message },
      { status: 502 }
    )
  }

  const latestPosts = (profileItem.latestPosts ?? []).filter(
    (p) => typeof p.displayUrl === 'string'
  )
  const imageUrls = latestPosts
    .slice(0, 12)
    .map((p) => p.displayUrl as string)
  const { postsPerWeek, lastPostAgeDays } = calcCadence(
    latestPosts.map((p) => p.timestamp)
  )

  // --- Build context for the scorer ---
  const lines: string[] = [
    `BUSINESS NAME: ${lead.business_name}`,
    `IG: @${igHandle} — ${profileItem.fullName ?? '(no display name)'}`,
    lead.website ? `Website: ${lead.website}` : null,
    lead.location ? `Location: ${lead.location}` : null,
  ].filter(Boolean) as string[]
  if (profileItem.biography) {
    lines.push(`IG bio: ${profileItem.biography.slice(0, 300)}`)
  }
  if (typeof profileItem.followersCount === 'number') {
    lines.push(`IG followers: ${profileItem.followersCount.toLocaleString()}`)
  }
  if (typeof profileItem.postsCount === 'number') {
    lines.push(`IG total posts: ${profileItem.postsCount.toLocaleString()}`)
  }
  if (postsPerWeek !== null) {
    lines.push(`Posting cadence: ${postsPerWeek.toFixed(1)} posts/week`)
  }
  if (lastPostAgeDays !== null) {
    lines.push(`Last post: ${lastPostAgeDays} days ago`)
  }
  if (imageUrls.length > 0) {
    lines.push(
      `Showing ${imageUrls.length} recent post images via vision (next message). Judge actual photography quality + grading consistency from what you see.`
    )
  }

  const userContent = `Score this lead against the ICP. You have IG visuals + cadence — use them.\n\n${lines.join('\n')}\n\nReturn the verdict.`

  let verdict: z.infer<typeof ResultSchema>
  try {
    verdict = await callAnthropicTool({
      system: ICP_SCORER_SYSTEM_PROMPT,
      userContent,
      toolName: 'submit_icp_score',
      schema: ResultSchema,
      imageUrls,
      maxTokens: 2048,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'scorer failed', message },
      { status: 500 }
    )
  }

  // --- Persist ---
  const existingDiagnosis = (lead.diagnosis ?? {}) as Record<string, unknown>
  const existingMetadata = (lead.discovery_metadata ?? {}) as Record<
    string,
    unknown
  >
  const updatedDiagnosis = {
    ...existingDiagnosis,
    icpScore: {
      ...verdict,
      scoredAt: new Date().toISOString(),
      withVision: true,
    },
  } as unknown as Json
  const updatedMetadata = {
    ...existingMetadata,
    ig_followers_count: profileItem.followersCount ?? null,
    ig_posts_count: profileItem.postsCount ?? null,
    ig_bio: profileItem.biography ?? null,
    latest_post_image_urls: imageUrls,
    posts_per_week: postsPerWeek,
    last_post_age_days: lastPostAgeDays,
    last_ig_scrape_at: new Date().toISOString(),
  } as unknown as Json

  const { error: updateErr } = await supabase
    .from('leads')
    .update({
      diagnosis: updatedDiagnosis,
      discovery_metadata: updatedMetadata,
      opportunity_score: verdict.score,
      ig_handle: igHandle,
    })
    .eq('id', id)
    .eq('owner_id', user.id)
  if (updateErr) {
    return NextResponse.json(
      { error: 'failed to persist score', message: updateErr.message },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    verdict,
    cadence: { postsPerWeek, lastPostAgeDays },
    imageCount: imageUrls.length,
  })
}
