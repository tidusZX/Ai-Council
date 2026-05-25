import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import {
  fetchNotionPageForPush,
  markRowScheduled,
  toDriveDownloadUrl,
} from '@/lib/notion'
import {
  createInstagramPost,
  createLinkedInPost,
  linkedInConfigured,
  type CreatePostResponse,
} from '@/lib/blotato'

export const maxDuration = 30

// Blotato's documented Instagram constraint. The platform itself allows
// more, but Blotato's API validates server-side and rejects past this.
const MAX_HASHTAGS = 5

// Default scheduling time when a row has Scheduled Date but no explicit
// timestamp: 9am Singapore (01:00 UTC). Picked because morning IG check-in
// is when reach concentrates; safe default until per-post time picker ships.
const DEFAULT_POST_TIME_UTC = '01:00:00Z'

const Body = z.object({
  /**
   * Optional ISO 8601. If omitted, the route derives scheduling from the
   * Notion row's `Scheduled Date` (if set) or falls back to Blotato's
   * next-free-slot queue. Direct immediate publishing is NEVER the default.
   */
  scheduledTime: z.string().datetime().optional(),
  imageUrlOverride: z.url().optional(),
  mediaUrlsOverride: z.array(z.url()).min(1).max(10).optional(),
})

function countHashtags(text: string): number {
  return (text.match(/(?:^|\s)#\w+/g) ?? []).length
}

function looksLikeDriveFolder(url: string): boolean {
  return /drive\.google\.com\/.*\/folders\//i.test(url)
}

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

  if (page.status !== 'Planned' && page.status !== 'Drafting') {
    return NextResponse.json(
      {
        error: 'unexpected status',
        message: `Notion page status is "${page.status}" — only "Planned" or "Drafting" rows can be pushed.`,
      },
      { status: 409 }
    )
  }

  const overrideUrls =
    bodyParsed.data.mediaUrlsOverride ??
    (bodyParsed.data.imageUrlOverride
      ? [bodyParsed.data.imageUrlOverride]
      : null)
  const rawUrls = overrideUrls ?? page.imageUrls
  if (rawUrls.length === 0) {
    return NextResponse.json(
      {
        error: 'no media url',
        message:
          'Notion page has no Image or Drive Link populated. Add slides to the Image (Files & media) column then retry.',
      },
      { status: 400 }
    )
  }

  // Drive folder URLs aren't fetchable — Blotato responds with a terse
  // "Invalid Google Drive URL format" 422. Catch it here with a useful
  // message + the exact form to use instead.
  const folderUrl = rawUrls.find(looksLikeDriveFolder)
  if (folderUrl) {
    return NextResponse.json(
      {
        error: 'drive folder url not supported',
        message: `One of the media URLs is a Drive folder, not a file: ${folderUrl}. Paste individual file URLs into the Image column instead, one per slide. Each must look like https://drive.google.com/file/d/<FILE_ID>/view.`,
      },
      { status: 400 }
    )
  }

  const mediaUrls = rawUrls.map(toDriveDownloadUrl)

  if (!page.caption || page.caption.length < 20) {
    return NextResponse.json(
      {
        error: 'caption too short',
        message: `Caption is only ${page.caption.length} chars. Update Draft Caption in Notion before pushing.`,
      },
      { status: 400 }
    )
  }

  const hashtagCount = countHashtags(page.caption)
  if (hashtagCount > MAX_HASHTAGS) {
    return NextResponse.json(
      {
        error: 'too many hashtags',
        message: `Caption has ${hashtagCount} hashtags. Blotato caps Instagram posts at ${MAX_HASHTAGS} — trim Draft Caption in Notion and retry.`,
      },
      { status: 400 }
    )
  }

  // Scheduling resolution (explicit > Notion date > queue). We never want
  // an empty timing block — that means "publish immediately" to Blotato,
  // which is almost never what the user wants from /scheduled-pipeline.
  const explicitTime = bodyParsed.data.scheduledTime
  const dateFromNotion = page.scheduledDate
    ? `${page.scheduledDate}T${DEFAULT_POST_TIME_UTC}`
    : null
  const scheduledTime = explicitTime ?? dateFromNotion ?? undefined
  const useNextFreeSlot = !scheduledTime

  let igResp: CreatePostResponse
  try {
    igResp = await createInstagramPost({
      text: page.caption,
      mediaUrls,
      scheduledTime,
      useNextFreeSlot,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'blotato push failed (instagram)', message },
      { status: 502 }
    )
  }

  // LinkedIn cross-post is best-effort. IG is the primary destination —
  // if LinkedIn fails (missing env, platform-specific constraint, network),
  // we still consider the push a success and surface the LinkedIn error
  // in the response so the user knows to retry manually if they want.
  let linkedInResp: CreatePostResponse | null = null
  let linkedInError: string | null = null
  if (linkedInConfigured()) {
    try {
      linkedInResp = await createLinkedInPost({
        text: page.caption,
        mediaUrls,
        scheduledTime,
        useNextFreeSlot,
      })
    } catch (e) {
      linkedInError = e instanceof Error ? e.message : String(e)
    }
  }

  try {
    await markRowScheduled(pageId)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: true,
      blotato: igResp,
      linkedIn: linkedInResp,
      linkedInError,
      scheduling: { scheduledTime, useNextFreeSlot },
      warning: 'pushed to Blotato but Notion status update failed',
      notionError: message,
    })
  }

  return NextResponse.json({
    ok: true,
    blotato: igResp,
    linkedIn: linkedInResp,
    linkedInError,
    scheduling: { scheduledTime, useNextFreeSlot },
  })
}
