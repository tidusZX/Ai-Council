import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { createClient } from '@shaq-os/supabase-client/server'
import { CHAIRPERSON, COUNCIL_MEMBERS } from '@shaq-os/council-config'
import type { Json } from '@shaq-os/database-types'

export const maxDuration = 60

const Body = z.object({
  question: z.string().min(2).max(2000),
})

const Params = z.object({ id: z.uuid() })

const FOLLOWUP_SYSTEM = `${CHAIRPERSON.systemPrompt}

This is a FOLLOW-UP question after the initial council session has concluded. You have:
- The original prompt
- All five members' initial responses
- Your prior synthesis
- The earlier follow-up turns (if any)
- The user's new follow-up question

Stay grounded in what the council actually said. Reference specific members by name when relevant (the Strategist said X, the Critic pushed back with Y). Push back on yourself if the new question exposes a weakness in the prior synthesis. Don't repeat the original verdict — extend or refine it.

Keep follow-ups TIGHT — aim for 150-300 words unless the question demands more.`

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const paramsParsed = Params.safeParse(await ctx.params)
  if (!paramsParsed.success) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const bodyParsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!bodyParsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(bodyParsed.error) },
      { status: 400 }
    )
  }

  // Load session (ownership check via RLS)
  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', paramsParsed.data.id)
    .single()
  if (sessionErr || !session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }

  // Load all initial member messages (round 1)
  const { data: messages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })

  // Load prior follow-up turns
  const { data: priorDiscussions } = await supabase
    .from('council_outputs')
    .select('id, payload, created_at')
    .eq('session_id', session.id)
    .eq('kind', 'other')
    .order('created_at', { ascending: true })

  const memberByRole = new Map(
    (messages ?? []).filter((m) => m.role !== 'chairperson').map((m) => [m.role, m.content])
  )
  const chairpersonContent =
    (messages ?? []).find((m) => m.role === 'chairperson')?.content ?? ''

  const memberSection = COUNCIL_MEMBERS.map((m) => {
    const content = memberByRole.get(m.role) ?? '(no response captured)'
    return `### ${m.name}\n${content}`
  }).join('\n\n')

  const priorSection = (priorDiscussions ?? [])
    .map((d, i) => {
      const p = (d.payload as { type?: string; question?: string; response?: string } | null) ?? {}
      if (p.type !== 'discussion') return null
      return `### Follow-up ${i + 1} — User asked:\n${p.question}\n\n### Chairperson responded:\n${p.response}`
    })
    .filter(Boolean)
    .join('\n\n---\n\n')

  const userMessage = [
    `**Original Prompt:**\n${session.prompt}`,
    `**Council Members' Initial Responses:**\n${memberSection}`,
    `**Your Prior Chairperson Synthesis:**\n${chairpersonContent || '(no synthesis on record)'}`,
    priorSection ? `**Prior follow-up turns:**\n${priorSection}` : null,
    `**New Follow-up Question:**\n${bodyParsed.data.question}`,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n')

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = anthropic('claude-sonnet-4-6')

  let responseText: string
  try {
    const { text } = await generateText({
      model,
      system: FOLLOWUP_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    })
    responseText = text.trim()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'follow-up generation failed', message },
      { status: 500 }
    )
  }

  const payload = {
    type: 'discussion',
    question: bodyParsed.data.question,
    response: responseText,
  }
  const { data: inserted, error: insertErr } = await supabase
    .from('council_outputs')
    .insert({
      session_id: session.id,
      kind: 'other',
      payload: payload as unknown as Json,
    })
    .select('id, payload, created_at')
    .single()

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: 'failed to save discussion', message: insertErr?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ discussion: inserted })
}
