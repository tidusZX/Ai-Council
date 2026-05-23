import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { fetchNotionPageForPush, markRowScheduled } from '@/lib/notion'
import { createInstagramPost } from '@/lib/blotato'

export const maxDuration = 30

const Body = z.object({
  /**
   * Optional ISO 8601 — if omitted, schedules at Blotato's next free slot.
   * Front-end usually passes the computed scheduled date from the plan.
   */
  scheduledTime: z.string().datetime().optional(),
  /**
   * Optional override for the image URL if Shaq has uploaded the final
   * asset elsewhere and pasted it into a different column.
   */
  imageUrlOverride: z.url().optional(),
})

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

  const { id: pageId } = await ctx.params
  if (!pageId || pageId.length < 10) {
    return NextResponse.json({ error: 'invalid page id' }, { status: 400 })
  }

  const bodyParsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!bodyParsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(bodyParsed.error) },
      { status: 400 }
    )
  }

  let page
  try {
    page = await fetchNotionPageForPush(pageId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'failed to read notion page', message },
      { status: 502 }
    )
  }

  if (page.status !== 'Planned' && page.status !== 'Ready') {
    return NextResponse.json(
      {
        error: 'unexpected status',
        message: `Notion page status is "${page.status}" — only "Planned" or "Ready" rows can be pushed.`,
      },
      { status: 409 }
    )
  }

  const imageUrl = bodyParsed.data.imageUrlOverride ?? page.imageUrl
  if (!imageUrl) {
    return NextResponse.json(
      {
        error: 'no image url',
        message:
          'Notion page has no Image or Drive Link populated. Paste the final asset URL into the Image column then retry.',
      },
      { status: 400 }
    )
  }
  if (!page.caption || page.caption.length < 20) {
    return NextResponse.json(
      {
        error: 'caption too short',
        message: `Caption is only ${page.caption.length} chars. Update Draft Caption in Notion before pushing.`,
      },
      { status: 400 }
    )
  }

  let blotatoResp
  try {
    blotatoResp = await createInstagramPost({
      text: page.caption,
      mediaUrls: [imageUrl],
      scheduledTime: bodyParsed.data.scheduledTime,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'blotato push failed', message },
      { status: 502 }
    )
  }

  try {
    await markRowScheduled(pageId)
  } catch (e) {
    // Don't fail the request if Notion writeback fails — the post is already
    // scheduled on Blotato. Surface the warning so the user knows to
    // flip the status manually.
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: true,
      blotato: blotatoResp,
      warning: 'pushed to Blotato but Notion status update failed',
      notionError: message,
    })
  }

  return NextResponse.json({ ok: true, blotato: blotatoResp })
}
