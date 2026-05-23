import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { createClient } from '@shaq-os/supabase-client/server'
import { BRAINSTORMER_SYSTEM_PROMPT } from '@shaq-os/council-config'

export const maxDuration = 60

const Body = z.object({
  topic: z.string().min(3).max(400),
  count: z.number().int().min(3).max(10).default(7),
})

const IdeaSchema = z.object({
  title: z.string().min(3).max(120),
  hook: z.string().min(3).max(160),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']),
  draftCaption: z.string().min(20).max(700),
  rationale: z
    .string()
    .min(10)
    .describe(
      'One sentence on why this idea earns a slot — what makes it specifically Shaq, not generic'
    ),
})

const ResultSchema = z.object({
  ideas: z.array(IdeaSchema).min(3).max(10),
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
  const { topic, count } = parsed.data

  const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const model = anthropic(process.env.ANALYSIS_MODEL || 'claude-sonnet-4-6')

  try {
    const result = await generateObject({
      model,
      system: BRAINSTORMER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `TOPIC: ${topic}\nCOUNT: ${count}\n\nProduce ${count} distinct ideas per the system prompt rules.`,
        },
      ],
      schema: ResultSchema,
    })
    return NextResponse.json({ ideas: result.object.ideas })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'brainstorm failed', message },
      { status: 500 }
    )
  }
}
