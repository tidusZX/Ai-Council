/**
 * POST /api/import-existing
 *
 * Bulk-add carousels/posts you've already designed (or already published)
 * straight into the Notion Content DB without touching the planner or
 * brainstorm AI calls. Useful for getting existing assets into the same
 * pipeline as freshly-generated ones — Status can be set directly so the
 * planner ignores them.
 *
 * Body shape:
 *   {
 *     items: [{
 *       title, format, draftCaption,
 *       status?       = 'Planned',  // 'Idea' | 'Planned' | 'Scheduled' | 'Published'
 *       client?, hook?, hashtags?,
 *       scheduledDate?,  // ISO yyyy-mm-dd; auto-derives Week
 *       imageUrl?,       // URL property; full file uploads need manual drag in Notion
 *       shootName?,
 *     }]
 *   }
 *
 * Returns: { inserted, errors }
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import { Client as NotionClient } from '@notionhq/client'
import crypto from 'node:crypto'

export const maxDuration = 60

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? ''
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? ''

const FORMAT_EMOJI: Record<string, string> = {
  CAROUSEL: '🎠 Carousel',
  SINGLE: '🖼 Single',
  EDUCATIONAL: '🎓 Educational',
  'RE-EDIT': '✏️ Re-edit',
}

const ItemSchema = z.object({
  title: z.string().min(3).max(200),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']),
  draftCaption: z.string().min(5).max(2000),
  status: z.enum(['Idea', 'Planned', 'Scheduled', 'Published']).default('Planned'),
  client: z.string().max(120).optional(),
  hook: z.string().max(500).optional(),
  hashtags: z.array(z.string().min(1).max(60)).max(30).optional(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use ISO yyyy-mm-dd')
    .optional(),
  /**
   * Single Drive/image URL for backward compat. Goes into Notion `Drive
   * Link` property.
   */
  imageUrl: z.url().optional(),
  /**
   * Multi-image — for carousels. Each URL becomes an external file in the
   * Notion `Image` files property (calendar previews + Blotato push read
   * from here). The first URL also goes into Drive Link if imageUrl wasn't
   * provided separately.
   */
  imageUrls: z.array(z.url()).max(10).optional(),
  shootName: z.string().max(200).optional(),
})
type Item = z.infer<typeof ItemSchema>

const Body = z.object({
  items: z.array(ItemSchema).min(1).max(40),
})

function makeIdeaId(title: string, i: number): string {
  return crypto
    .createHash('sha1')
    .update(`import|${title}|${i}|${Date.now()}`)
    .digest('hex')
    .slice(0, 12)
}

function weekFromDate(dateStr: string | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  return Math.min(4, Math.max(1, Math.ceil(d.getDate() / 7)))
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  if (!NOTION_API_KEY || !NOTION_DATABASE_ID) {
    return NextResponse.json(
      { error: 'Notion env not configured' },
      { status: 500 }
    )
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  const notion = new NotionClient({ auth: NOTION_API_KEY })
  const inserted: { title: string; notionPageId: string }[] = []
  const errors: string[] = []

  for (let i = 0; i < parsed.data.items.length; i++) {
    const item: Item = parsed.data.items[i]
    try {
      const ideaId = makeIdeaId(item.title, i)
      const week = weekFromDate(item.scheduledDate)
      const properties: Record<string, unknown> = {
        Title: {
          title: [{ type: 'text', text: { content: item.title.slice(0, 200) } }],
        },
        Format: {
          select: { name: FORMAT_EMOJI[item.format] ?? FORMAT_EMOJI.SINGLE },
        },
        Status: { select: { name: item.status } },
        'Draft Caption': {
          rich_text: [
            { type: 'text', text: { content: item.draftCaption.slice(0, 2000) } },
          ],
        },
        'Idea Id': {
          rich_text: [{ type: 'text', text: { content: ideaId } }],
        },
        Shoot: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: (item.shootName ?? 'Imported').slice(0, 200),
              },
            },
          ],
        },
      }
      if (item.hook) {
        properties.Hook = {
          rich_text: [
            { type: 'text', text: { content: item.hook.slice(0, 500) } },
          ],
        }
      }
      if (item.client) {
        properties.Client = { select: { name: item.client.slice(0, 120) } }
      }
      if (item.hashtags?.length) {
        properties.Hashtags = {
          multi_select: item.hashtags.map((h) => ({ name: h.slice(0, 60) })),
        }
      }
      if (item.scheduledDate) {
        properties['Scheduled Date'] = {
          date: { start: item.scheduledDate },
        }
      }
      if (week != null) {
        properties.Week = { number: week }
      }
      // Multi-image: write all URLs as external files into the Image files
      // property (Notion calendar previews + Blotato fallback both read this).
      // First URL also goes into Drive Link for backward compat with code paths
      // that still read that property.
      const allImageUrls = [
        ...(item.imageUrl ? [item.imageUrl] : []),
        ...(item.imageUrls ?? []),
      ]
      // Dedupe while preserving order.
      const dedupedImages = Array.from(new Set(allImageUrls))
      if (dedupedImages.length > 0) {
        properties['Drive Link'] = { url: dedupedImages[0] }
        properties['Image'] = {
          files: dedupedImages.slice(0, 10).map((url, k) => ({
            type: 'external',
            name: `image-${k + 1}`,
            external: { url },
          })),
        }
      }

      const page = await notion.pages.create({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: properties as Parameters<
          typeof notion.pages.create
        >[0]['properties'],
      })
      inserted.push({ title: item.title, notionPageId: page.id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${item.title}: ${msg}`)
    }
  }

  return NextResponse.json({
    inserted: inserted.length,
    items: inserted,
    errors,
  })
}
