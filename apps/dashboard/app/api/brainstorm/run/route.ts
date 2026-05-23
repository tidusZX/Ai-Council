import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { BRAINSTORMER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import { callAnthropicTool } from '@/lib/anthropic-tool'

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

  try {
    const result = await callAnthropicTool({
      system: BRAINSTORMER_SYSTEM_PROMPT,
      userContent: `TOPIC: ${topic}\nCOUNT: ${count}\n\nProduce ${count} distinct ideas per the system prompt rules.`,
      toolName: 'submit_brainstorm',
      schema: ResultSchema,
    })
    return NextResponse.json({ ideas: result.ideas })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'brainstorm failed', message },
      { status: 500 }
    )
  }
}
