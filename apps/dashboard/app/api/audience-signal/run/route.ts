import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { MARKET_RESEARCHER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import type { Json } from '@shaq-os/database-types'
import { callAnthropicTool } from '@/lib/anthropic-tool'

export const maxDuration = 60

const Body = z.object({
  topic: z.string().min(3).max(600),
  icpOverride: z.string().max(800).optional(),
  sessionId: z.string().uuid().optional(),
})

const PainPointSchema = z.object({
  id: z.string().min(1).max(40),
  headline: z.string().min(5).max(160),
  evidence: z.string().min(5).max(400),
  severity: z.number().int().min(1).max(3),
})

const KnowledgeGapSchema = z.object({
  id: z.string().min(1).max(40),
  headline: z.string().min(5).max(160),
  whyItMatters: z.string().min(5).max(400),
})

const DecisionPatternSchema = z.object({
  id: z.string().min(1).max(40),
  observation: z.string().min(5).max(300),
  implicationForContent: z.string().min(5).max(300),
})

const AngleSchema = z.object({
  id: z.string().min(1).max(40),
  topic: z.string().min(10).max(280),
  painPointId: z.string().min(1).max(40),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']),
  oneLineHook: z.string().min(5).max(200),
  why: z.string().min(5).max(300),
})

const ResultSchema = z.object({
  summary: z.string().min(10).max(400),
  painPoints: z.array(PainPointSchema).min(3).max(12),
  knowledgeGaps: z.array(KnowledgeGapSchema).min(3).max(12),
  decisionPatterns: z.array(DecisionPatternSchema).min(2).max(10),
  angles: z.array(AngleSchema).min(6).max(12),
  topPicks: z.array(z.string().min(1).max(40)).length(3),
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
  const { topic, icpOverride, sessionId } = parsed.data

  const userContent = [
    `TOPIC / AUDIENCE FOCUS: ${topic}`,
    icpOverride ? `ICP OVERRIDE: ${icpOverride}` : null,
    `\nReturn the full audience signal per the system prompt schema.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const result = await callAnthropicTool({
      system: MARKET_RESEARCHER_SYSTEM_PROMPT,
      userContent,
      toolName: 'submit_audience_signal',
      schema: ResultSchema,
    })

    if (sessionId) {
      await supabase.from('council_outputs').insert({
        session_id: sessionId,
        kind: 'analysis',
        payload: {
          lens: 'market_researcher',
          topic,
          icpOverride: icpOverride ?? null,
          ...result,
        } as unknown as Json,
      })
    }

    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'audience-signal failed', message },
      { status: 500 }
    )
  }
}
