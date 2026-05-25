/**
 * POST /api/compose/from-images — image-first composition
 *
 * Body: { imageUrls, context?, client? }
 *
 * Forwards the images to Anthropic vision via the IMAGE_COMPOSER persona.
 * Returns a complete draft post (title / format / hook / caption /
 * hashtags / inferredSubject / suggestedClient / confidence / flags)
 * ready to drop into /compose's downstream sharpen + Send-to-Notion flow.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { IMAGE_COMPOSER_SYSTEM_PROMPT } from '@shaq-os/council-config'
import { callAnthropicTool } from '@/lib/anthropic-tool'

export const maxDuration = 120

const Body = z.object({
  imageUrls: z.array(z.url()).min(1).max(10),
  context: z.string().max(500).optional(),
  client: z.string().max(120).optional(),
})

const ResultSchema = z.object({
  title: z.string().min(3).max(160),
  hook: z.string().min(5).max(300),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']),
  draftCaption: z.string().min(20).max(800),
  // Hard cap matches Blotato/Instagram. Prompt asks for 3-5; schema
  // enforces the upper bound so a model overshoot fails fast.
  hashtags: z.array(z.string().min(2).max(60)).min(3).max(5),
  inferredSubject: z.string().min(5).max(600),
  suggestedClient: z.string().max(120).nullable(),
  confidence: z.number().int().min(1).max(3),
  flags: z.array(z.string().min(3).max(200)).max(5).default([]),
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
  const { imageUrls, context, client } = parsed.data

  const userContent = [
    `Here are ${imageUrls.length} image${imageUrls.length === 1 ? '' : 's'} I've prepared as Instagram content.`,
    context ? `\nContext I want to give you: ${context}` : null,
    client ? `\nClient (if relevant): ${client}` : null,
    `\nInfer what this post should be about and propose the draft.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const result = await callAnthropicTool({
      system: IMAGE_COMPOSER_SYSTEM_PROMPT,
      userContent,
      toolName: 'submit_image_composition',
      schema: ResultSchema,
      imageUrls,
      maxTokens: 4096,
    })
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'compose-from-images failed', message },
      { status: 500 }
    )
  }
}
