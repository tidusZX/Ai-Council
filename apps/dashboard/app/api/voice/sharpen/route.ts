import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { EMBER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import { callAnthropicTool } from '@/lib/anthropic-tool'

export const maxDuration = 60

const Body = z.object({
  draftCaption: z.string().min(5).max(2000),
  title: z.string().min(3).max(160).optional(),
  hook: z.string().max(200).optional(),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']).optional(),
  client: z.string().max(120).nullable().optional(),
  includeHashtags: z.boolean().default(false),
  includeFullPost: z.boolean().default(false),
})

const ResultSchema = z.object({
  sharpenedCaption: z.string().min(5).max(800),
  angle: z.string().min(5).max(300),
  changesSummary: z.array(z.string().min(3).max(200)).min(0).max(8),
  bannedWordsRemoved: z.array(z.string().min(1).max(40)).max(20),
  ctaUsed: z.string().min(1).max(80),
  confidence: z.number().int().min(1).max(3),
  flags: z.array(z.string().min(3).max(200)).max(5),
  // Hard cap matches Blotato/Instagram. Prompt asks for 3-5; schema
  // enforces the upper bound so a model overshoot fails fast.
  hashtags: z.array(z.string().min(2).max(60)).max(5).default([]),
  fullPost: z.string().max(2400).nullable().default(null),
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
  const {
    draftCaption,
    title,
    hook,
    format,
    client,
    includeHashtags,
    includeFullPost,
  } = parsed.data

  const context = [
    title ? `TITLE: ${title}` : null,
    hook ? `HOOK: ${hook}` : null,
    format ? `FORMAT: ${format}` : null,
    client ? `CLIENT: ${client}` : null,
    includeHashtags ? 'includeHashtags: true (generate hashtags per the rules)' : null,
    includeFullPost
      ? 'includeFullPost: true (compose the copy-paste-ready Instagram body)'
      : null,
    `\nDRAFT CAPTION:\n${draftCaption}\n\nSharpen per the rules above.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const result = await callAnthropicTool({
      system: EMBER_SYSTEM_PROMPT,
      userContent: context,
      toolName: 'submit_sharpened_caption',
      schema: ResultSchema,
    })
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'voice sharpen failed', message },
      { status: 500 }
    )
  }
}
