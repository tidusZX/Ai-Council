import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { CONTENT_PLANNER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import type { Json } from '@shaq-os/database-types'
import { callAnthropicTool } from '@/lib/anthropic-tool'
import { listOccupiedSlots, type OccupiedSlot } from '@/lib/notion'

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

/**
 * Heuristic — convert a monthLabel ("May 2026", "May", "2026-05") into a
 * 'YYYY-MM' filter prefix for Scheduled Date matching. Returns null if the
 * label is too ambiguous, in which case we fall back to "all months".
 */
function monthLabelToYYYYMM(label: string | undefined): string | null {
  if (!label) return null
  const trimmed = label.trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  }
  const m = trimmed.toLowerCase().match(/^([a-z]+)(?:\s+(\d{4}))?$/)
  if (!m) return null
  const mm = months[m[1]]
  if (!mm) return null
  const yyyy = m[2] ?? String(new Date().getFullYear())
  return `${yyyy}-${mm}`
}

function summariseOccupied(occupied: OccupiedSlot[]): string {
  if (occupied.length === 0) return '(none — full month is open)'
  return occupied
    .map((o, i) => {
      const wk = o.weekNumber != null ? `week ${o.weekNumber}` : 'no week'
      const dt = o.scheduledDate ?? 'no date'
      return `${i + 1}. "${o.title}" — ${o.status} · ${wk} · ${dt}`
    })
    .join('\n')
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

  // ---------------------------------------------------------------------
  // Gap fix: read already-planned/scheduled/published rows so the planner
  // doesn't double-book the month or exceed the 10-post cap.
  // ---------------------------------------------------------------------
  const monthFilter = monthLabelToYYYYMM(monthLabel)
  let occupied: OccupiedSlot[] = []
  let occupiedError: string | null = null
  try {
    occupied = await listOccupiedSlots(monthFilter ?? undefined)
  } catch (e) {
    occupiedError = e instanceof Error ? e.message : String(e)
    occupied = []
  }
  const remainingTarget = Math.max(0, 10 - occupied.length)

  if (remainingTarget === 0) {
    return NextResponse.json({
      plan: null,
      warning: `Month already has ${occupied.length} posts planned/scheduled/published. Cap is 10. Nothing to add.`,
      occupied,
    })
  }

  const candidateBlock = summariseCandidates(candidates)
  const userMessage = `Plan content for: ${monthLabel ?? 'next month'}.

ALREADY-LOCKED THIS MONTH (do NOT re-plan, do NOT double-book these weeks if avoidable):
${summariseOccupied(occupied)}

TARGET: pick ${remainingTarget} new posts (10 monthly cap minus ${occupied.length} already locked). If the candidate pool is too thin for ${remainingTarget} high-quality picks, return fewer with a note in the summary.

There are ${candidates.length} candidate post ideas. Score each, pick the best ${remainingTarget}, sequence them into the remaining 4-week arc, and return the structured plan.

CANDIDATES:

${candidateBlock}`

  let plan: z.infer<typeof PlanSchema>
  try {
    plan = await callAnthropicTool({
      system: CONTENT_PLANNER_SYSTEM_PROMPT,
      userContent: userMessage,
      toolName: 'submit_monthly_plan',
      schema: PlanSchema,
      maxTokens: 16384,
    })
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

  return NextResponse.json({
    plan,
    sessionId: session.id,
    occupied,
    remainingTarget,
    monthFilter,
    occupiedError,
  })
}
