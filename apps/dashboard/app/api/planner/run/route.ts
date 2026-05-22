import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { createClient } from '@shaq-os/supabase-client/server'
import { CONTENT_PLANNER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import type { Json } from '@shaq-os/database-types'

export const maxDuration = 120

const CandidateSchema = z.object({
  ideaId: z.string(),
  title: z.string(),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']),
  client: z.string().nullable(),
  shootName: z.string().nullable().optional(),
  hook: z.string().optional(),
  draftCaption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  postabilityScore: z.number().optional(),
  primaryImageId: z.string().optional(),
})
type Candidate = z.infer<typeof CandidateSchema>

const Body = z.object({
  monthLabel: z.string().min(3).max(40).optional(),
  candidates: z.array(CandidateSchema).min(5).max(150),
})

const PickSchema = z.object({
  ideaId: z.string(),
  weekNumber: z.number().int().min(1).max(4),
  slotInWeek: z.number().int().min(1).max(4),
  scores: z.object({
    icp_signal: z.number().int().min(1).max(3),
    proof_density: z.number().int().min(1).max(3),
    format_leverage: z.number().int().min(1).max(2),
    total: z.number().int().min(3).max(8),
  }),
  isFirstPostCandidate: z.boolean(),
  arcPosition: z.enum(['credibility_anchor', 'proof', 'process', 'soft_cta']),
  hasConversionHook: z.boolean(),
  finalCaption: z.string().min(20).max(2200),
  whyPicked: z.string().min(10),
})

const PlanSchema = z.object({
  summary: z.string(),
  picks: z.array(PickSchema).max(10),
  formatMix: z.object({
    carousels: z.number().int(),
    singles: z.number().int(),
    educational: z.number().int(),
  }),
  clientDiversity: z
    .array(
      z.object({
        client: z.string(),
        count: z.number().int(),
      })
    )
    .optional(),
  conversionHookCount: z.number().int(),
  droppedCount: z.number().int().optional(),
})

function summariseCandidates(candidates: Candidate[]): string {
  return candidates
    .map((c) => {
      const lines = [
        `ideaId: ${c.ideaId}`,
        `format: ${c.format}`,
        `client: ${c.client ?? '(unknown)'}`,
        c.shootName ? `shoot: ${c.shootName}` : null,
        c.postabilityScore != null ? `postability: ${c.postabilityScore}` : null,
        `title: ${c.title}`,
        c.hook ? `hook: ${c.hook}` : null,
        c.draftCaption ? `draftCaption: ${c.draftCaption.slice(0, 500)}` : null,
      ].filter(Boolean)
      return lines.join('\n')
    })
    .join('\n\n---\n\n')
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const bodyParsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!bodyParsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(bodyParsed.error) },
      { status: 400 }
    )
  }

  const { candidates, monthLabel } = bodyParsed.data
  const candidateBlock = summariseCandidates(candidates)
  const userMessage = `Plan content for: ${monthLabel ?? 'next month'}.

There are ${candidates.length} candidate post ideas. Score each, pick the best 10, sequence them into a 4-week arc, and return the structured plan.

CANDIDATES:

${candidateBlock}`

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = anthropic(process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6')

  let plan: z.infer<typeof PlanSchema>
  try {
    const result = await generateObject({
      model,
      system: CONTENT_PLANNER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      schema: PlanSchema,
    })
    plan = result.object
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'planner generation failed', message },
      { status: 500 }
    )
  }

  // Persist as a posting_plan in council_outputs. Anchor it to a fresh
  // session so the existing /sessions/[id] page can render the plan later
  // and so follow-up discussion on the plan reuses Plan 06A's discuss flow.
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .insert({
      user_id: user.id,
      title: `Content plan — ${monthLabel ?? new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`,
      prompt: `Monthly content plan from ${candidates.length} candidates.`,
      status: 'complete',
    })
    .select('id')
    .single()

  if (sessionErr || !session) {
    return NextResponse.json(
      {
        plan,
        warning: 'plan generated but not persisted',
        message: sessionErr?.message,
      },
      { status: 200 }
    )
  }

  await supabase.from('council_outputs').insert({
    session_id: session.id,
    kind: 'posting_plan',
    payload: plan as unknown as Json,
  })

  return NextResponse.json({ plan, sessionId: session.id })
}
