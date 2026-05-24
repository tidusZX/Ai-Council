/**
 * POST /api/leads/[id]/score — Plan 13 (ICP Scorer)
 *
 * Runs the ICP scorer against an existing lead's metadata + diagnosis +
 * discovery context. Writes the verdict into leads.diagnosis.icpScore
 * (keeps the visual-brand diagnosis intact) and updates
 * opportunity_score from the verdict.
 *
 * Body: empty. The route reads everything from the lead row itself.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { ICP_SCORER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import { callAnthropicTool } from '@/lib/anthropic-tool'
import type { Json } from '@shaq-os/database-types'

export const maxDuration = 60

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

export async function POST(
  _req: Request,
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

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()
  if (leadErr || !lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }

  // Assemble the context the scorer sees.
  const diagnosis = (lead.diagnosis ?? {}) as Record<string, unknown>
  const discoveryMetadata = (lead.discovery_metadata ?? {}) as Record<
    string,
    unknown
  >
  const lines: string[] = [
    `BUSINESS NAME: ${lead.business_name}`,
    lead.ig_handle ? `IG: @${lead.ig_handle}` : null,
    lead.website ? `Website: ${lead.website}` : null,
    lead.location ? `Location: ${lead.location}` : null,
    lead.discovery_source ? `Discovery source: ${lead.discovery_source}` : null,
  ].filter(Boolean) as string[]

  if (discoveryMetadata.followers_count) {
    lines.push(`IG followers: ${discoveryMetadata.followers_count}`)
  }
  if (discoveryMetadata.posts_count) {
    lines.push(`IG posts count: ${discoveryMetadata.posts_count}`)
  }
  if (discoveryMetadata.bio) {
    lines.push(`IG bio: ${discoveryMetadata.bio}`)
  }
  if (discoveryMetadata.category) {
    lines.push(`Maps category: ${discoveryMetadata.category}`)
  }
  if (discoveryMetadata.google_review_count) {
    lines.push(
      `Google reviews: ${discoveryMetadata.google_review_count} · rating ${discoveryMetadata.google_rating ?? '?'}`
    )
  }
  if (typeof diagnosis.overall_opportunity_score === 'number') {
    lines.push(
      `Existing visual-brand diagnosis score: ${diagnosis.overall_opportunity_score}/100`
    )
  }
  if (
    diagnosis.outreach_angle &&
    typeof diagnosis.outreach_angle === 'string'
  ) {
    lines.push(`Prior outreach angle: ${diagnosis.outreach_angle}`)
  }
  if (Array.isArray(diagnosis.top_gaps)) {
    lines.push(`Prior gaps: ${(diagnosis.top_gaps as string[]).join('; ')}`)
  }
  if (Array.isArray(diagnosis.red_flags)) {
    lines.push(`Prior red flags: ${(diagnosis.red_flags as string[]).join('; ')}`)
  }
  if (discoveryMetadata.why_they_fit) {
    lines.push(`Why-they-fit note (from seed): ${discoveryMetadata.why_they_fit}`)
  }

  const userContent = `Score this lead against the ICP.\n\n${lines.join('\n')}\n\nReturn the verdict.`

  let verdict: z.infer<typeof ResultSchema>
  try {
    verdict = await callAnthropicTool({
      system: ICP_SCORER_SYSTEM_PROMPT,
      userContent,
      toolName: 'submit_icp_score',
      schema: ResultSchema,
      maxTokens: 2048,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'scorer failed', message },
      { status: 500 }
    )
  }

  // Persist: write verdict into diagnosis.icpScore, update opportunity_score.
  // Multiply 1-10 → 10-100 for the existing opportunity_score column.
  const updatedDiagnosis = {
    ...diagnosis,
    icpScore: {
      ...verdict,
      scoredAt: new Date().toISOString(),
    },
  } as unknown as Json

  const { error: updateErr } = await supabase
    .from('leads')
    .update({
      diagnosis: updatedDiagnosis,
      opportunity_score: verdict.score * 10,
    })
    .eq('id', id)
    .eq('owner_id', user.id)

  if (updateErr) {
    return NextResponse.json(
      { error: 'failed to persist score', message: updateErr.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, verdict })
}
