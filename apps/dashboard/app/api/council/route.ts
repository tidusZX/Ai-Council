import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { createClient } from '@shaq-os/supabase-client/server'
import { COUNCIL_MEMBERS, CHAIRPERSON } from '@shaq-os/council-config'
import type { CouncilRole } from '@shaq-os/database-types'
import { z } from 'zod'

export const maxDuration = 60

const RequestSchema = z.object({
  sessionId: z.string().uuid(),
  role: z.enum([
    'strategist',
    'creative_director',
    'technical_producer',
    'marketing_lead',
    'critic',
    'chairperson',
  ]),
  // For chairperson: previous member responses to synthesize
  context: z.string().optional(),
})

function getModel() {
  const provider = process.env.AI_PROVIDER ?? 'anthropic'

  if (provider === 'openai') {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai('gpt-4o')
  }

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropic('claude-sonnet-4-6')
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = RequestSchema.safeParse(body)

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { sessionId, role, context } = parsed.data

  // Verify the session belongs to this user
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single()

  if (sessionError || !session) {
    return new Response('Session not found', { status: 404 })
  }

  const memberConfig = role === 'chairperson'
    ? CHAIRPERSON
    : COUNCIL_MEMBERS.find((m) => m.role === role)

  if (!memberConfig) {
    return new Response('Unknown council role', { status: 400 })
  }

  // Create or find message row to stream into
  const { data: existingMessage } = await supabase
    .from('messages')
    .select('id')
    .eq('session_id', sessionId)
    .eq('role', role as CouncilRole)
    .single()

  let messageId: string

  if (existingMessage) {
    messageId = existingMessage.id
    await supabase
      .from('messages')
      .update({ content: '', is_complete: false })
      .eq('id', messageId)
  } else {
    const { data: newMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        session_id: sessionId,
        role: role as CouncilRole,
        content: '',
        is_complete: false,
      })
      .select('id')
      .single()

    if (insertError || !newMessage) {
      return new Response('Failed to create message', { status: 500 })
    }

    messageId = newMessage.id
  }

  const userMessage =
    role === 'chairperson' && context
      ? `The council has spoken. Here is the prompt and their responses:\n\n**Original Prompt:**\n${session.prompt}\n\n**Council Responses:**\n${context}`
      : `Please evaluate the following:\n\n${session.prompt}`

  const model = getModel()

  const result = streamText({
    model,
    system: memberConfig.systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    onFinish: async ({ text }) => {
      await supabase
        .from('messages')
        .update({ content: text, is_complete: true })
        .eq('id', messageId)

      // Mark session complete when chairperson finishes
      if (role === 'chairperson') {
        await supabase
          .from('sessions')
          .update({ status: 'complete' })
          .eq('id', sessionId)
      }
    },
  })

  return result.toTextStreamResponse({
    headers: { 'X-Message-Id': messageId },
  })
}
