/**
 * POST /api/council/followup — Plan 06A
 *
 * Continues an existing AI Council session with a follow-up question.
 * Each call creates a new round (round_number = max(prior) + 1) of
 * messages tagged with the members the user addressed. Non-streaming —
 * runs the per-member calls in parallel, persists each on completion,
 * then runs the Chairperson with the round's responses as context.
 *
 * Returns:
 *   { roundNumber, newMessageIds: string[], skippedMembers: CouncilRole[] }
 *
 * The session view re-fetches messages and renders the new round grouped
 * by round_number.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { COUNCIL_MEMBERS, CHAIRPERSON } from '@shaq-os/council-config'
import type { CouncilRole } from '@shaq-os/database-types'
import { callAnthropicText } from '@/lib/anthropic-tool'

export const maxDuration = 120

const ALL_MEMBERS: CouncilRole[] = [
  'strategist',
  'creative_director',
  'technical_producer',
  'marketing_lead',
  'critic',
]
const ALL_ROLES: CouncilRole[] = [...ALL_MEMBERS, 'chairperson']

const Body = z.object({
  sessionId: z.string().uuid(),
  question: z.string().min(5).max(4000),
  addressedTo: z.array(z.enum(ALL_ROLES)).optional(),
  inReplyTo: z.string().uuid().optional(),
})

// Soft cap to keep follow-ups within Anthropic context limits. ~25k tokens
// is roughly 100k characters of context (rough rule of thumb; conservative).
// If exceeded, drop oldest rounds first but always keep round 1 verbatim.
const MAX_CONTEXT_CHARS = 100_000

interface PriorMessage {
  id: string
  role: string
  content: string
  is_complete: boolean
  round_number: number
  addressed_to: string[] | null | undefined
  created_at: string
}

function renderContext(prior: PriorMessage[]): string {
  // Drop incomplete or empty prior responses — they have no value as context.
  const valid = prior.filter((m) => m.is_complete && m.content.trim().length > 0)
  if (valid.length === 0) return '(no prior responses)'

  const byRound = new Map<number, PriorMessage[]>()
  for (const m of valid) {
    const list = byRound.get(m.round_number) ?? []
    list.push(m)
    byRound.set(m.round_number, list)
  }

  const rounds = [...byRound.keys()].sort((a, b) => a - b)
  const rendered: string[] = []

  for (const r of rounds) {
    const msgs = (byRound.get(r) ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    )
    rendered.push(`--- Round ${r} ---`)
    for (const m of msgs) {
      const addressed =
        m.addressed_to && m.addressed_to.length > 0
          ? ` (addressed: ${m.addressed_to.join(', ')})`
          : ''
      rendered.push(`[${m.role}${addressed}]\n${m.content.trim()}`)
    }
    rendered.push('')
  }

  let joined = rendered.join('\n')

  // Token budget: if too long, drop middle rounds (preserve round 1 + tail).
  if (joined.length > MAX_CONTEXT_CHARS && rounds.length > 2) {
    const keepFirst = byRound.get(rounds[0]) ?? []
    const keepLast = byRound.get(rounds[rounds.length - 1]) ?? []
    const headRendered = [`--- Round ${rounds[0]} ---`]
    for (const m of keepFirst) {
      headRendered.push(`[${m.role}]\n${m.content.trim()}`)
    }
    headRendered.push('')
    headRendered.push(`--- (rounds 2..${rounds.length - 1} omitted for context length) ---`)
    headRendered.push('')
    headRendered.push(`--- Round ${rounds[rounds.length - 1]} ---`)
    for (const m of keepLast) {
      headRendered.push(`[${m.role}]\n${m.content.trim()}`)
    }
    joined = headRendered.join('\n')
  }

  return joined
}

function buildFollowUpSystem(basePrompt: string, contextBlock: string): string {
  return `${basePrompt}

---
PRIOR ROUNDS (the user is following up on these — read carefully):

${contextBlock}

---
The user is now asking a follow-up. Address it directly — do not repeat your prior take unless asked. If the user mentions other members by name, you may reference their positions. Stay in your persona's lens. Be concise.`
}

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
  const { sessionId, question, addressedTo, inReplyTo } = parsed.data

  // Verify ownership + load session
  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select('id, user_id, prompt, status')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()
  if (sessErr || !session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }

  // Reject if another round is currently in flight.
  if (session.status === 'processing') {
    return NextResponse.json(
      { error: 'session is already processing a round — wait for it to finish' },
      { status: 409 }
    )
  }

  // Load prior messages.
  const { data: priorRaw } = await supabase
    .from('messages')
    .select('id, role, content, is_complete, round_number, addressed_to, created_at')
    .eq('session_id', sessionId)

  const prior: PriorMessage[] = (priorRaw ?? []).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    is_complete: m.is_complete,
    round_number: m.round_number ?? 1,
    addressed_to: m.addressed_to ?? [],
    created_at: m.created_at,
  }))

  const maxRound = prior.reduce((acc, m) => Math.max(acc, m.round_number), 0)
  const nextRound = maxRound + 1

  // Resolve target members. Default: all 5 + chairperson. If user explicitly
  // names a subset, honor it but always run Chairperson at the end (unless
  // they ONLY named one or more specific members AND not the chair — in
  // which case still run chair to keep the synthesis surface stable).
  const requested =
    addressedTo && addressedTo.length > 0 ? addressedTo : ALL_ROLES
  const targetMembers = requested.filter((r) =>
    ALL_MEMBERS.includes(r as (typeof ALL_MEMBERS)[number])
  ) as CouncilRole[]
  const wantsChair =
    requested.includes('chairperson') ||
    (!addressedTo || addressedTo.length === 0)

  // Build the shared context for member calls.
  const contextBlock = renderContext(prior)
  const userMessage = `${question}\n\n(Original prompt for context:\n${session.prompt})`

  // Mark session processing so concurrent attempts 409.
  await supabase
    .from('sessions')
    .update({ status: 'processing' })
    .eq('id', sessionId)

  const newMessageIds: string[] = []
  const skipped: CouncilRole[] = []

  try {
    // Phase A: parallel member calls.
    const memberResults = await Promise.all(
      targetMembers.map(async (role) => {
        const cfg = COUNCIL_MEMBERS.find((m) => m.role === role)
        if (!cfg) {
          skipped.push(role)
          return null
        }
        try {
          const text = await callAnthropicText({
            system: buildFollowUpSystem(cfg.systemPrompt, contextBlock),
            userContent: userMessage,
            maxTokens: 1500,
          })
          return { role, text }
        } catch (e) {
          skipped.push(role)
          return null
        }
      })
    )

    const memberRows = memberResults.filter(
      (r): r is { role: CouncilRole; text: string } => r !== null
    )

    // Persist all member responses.
    for (const m of memberRows) {
      const { data: row } = await supabase
        .from('messages')
        .insert({
          session_id: sessionId,
          role: m.role,
          content: m.text,
          is_complete: true,
          round_number: nextRound,
          addressed_to: requested as string[],
          in_reply_to: inReplyTo ?? null,
        })
        .select('id')
        .single()
      if (row) newMessageIds.push(row.id)
    }

    // Phase B: Chairperson synthesis of the new round's responses.
    if (wantsChair && memberRows.length > 0) {
      const newRoundContext = memberRows
        .map((m) => `[${m.role} round ${nextRound}]\n${m.text}`)
        .join('\n\n')
      const chairContext = `${contextBlock}\n\n--- New Round ${nextRound} Responses ---\n\n${newRoundContext}`
      try {
        const chairText = await callAnthropicText({
          system: buildFollowUpSystem(CHAIRPERSON.systemPrompt, chairContext),
          userContent: userMessage,
          maxTokens: 2000,
        })
        const { data: chairRow } = await supabase
          .from('messages')
          .insert({
            session_id: sessionId,
            role: 'chairperson',
            content: chairText,
            is_complete: true,
            round_number: nextRound,
            addressed_to: requested as string[],
            in_reply_to: inReplyTo ?? null,
          })
          .select('id')
          .single()
        if (chairRow) newMessageIds.push(chairRow.id)
      } catch (e) {
        skipped.push('chairperson')
      }
    }
  } finally {
    // Always release the lock.
    await supabase
      .from('sessions')
      .update({ status: 'complete' })
      .eq('id', sessionId)
  }

  return NextResponse.json({
    roundNumber: nextRound,
    newMessageIds,
    skippedMembers: skipped,
  })
}
