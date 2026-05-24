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

const IdeaSchema = z.object({
  title: z.string().min(3).max(120),
  hook: z.string().min(3).max(160),
  format: z.enum(['CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT']),
  draftCaption: z.string().min(20).max(700),
  rationale: z.string().min(10),
})

const Body = z.object({
  /**
   * Topic acts as the Shoot label in Notion. /api/brainstorm/run accepts
   * topics up to 400 chars; approve must match so any topic the user
   * could brainstorm with can also be approved.
   * Truncated to 200 chars when written to Notion (Shoot column cap).
   */
  topic: z.string().min(3).max(400),
  ideas: z.array(IdeaSchema).min(1).max(10),
})

function makeIdeaId(title: string): string {
  return crypto
    .createHash('sha1')
    .update(`brainstorm|${title}|${Date.now()}`)
    .digest('hex')
    .slice(0, 12)
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
  const created: string[] = []
  const errors: string[] = []

  for (const idea of parsed.data.ideas) {
    try {
      const ideaId = makeIdeaId(idea.title)
      await notion.pages.create({
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          Title: {
            title: [
              {
                type: 'text',
                text: { content: idea.title.slice(0, 200) },
              },
            ],
          },
          Format: { select: { name: FORMAT_EMOJI[idea.format] ?? FORMAT_EMOJI.SINGLE } },
          Status: { select: { name: 'Idea' } },
          Shoot: {
            rich_text: [
              {
                type: 'text',
                text: { content: `Brainstorm: ${parsed.data.topic}`.slice(0, 200) },
              },
            ],
          },
          Hook: {
            rich_text: [
              {
                type: 'text',
                text: { content: idea.hook.slice(0, 500) },
              },
            ],
          },
          'Draft Caption': {
            rich_text: [
              {
                type: 'text',
                text: { content: idea.draftCaption.slice(0, 2000) },
              },
            ],
          },
          'Idea Id': {
            rich_text: [
              { type: 'text', text: { content: ideaId } },
            ],
          },
        },
      })
      created.push(idea.title)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${idea.title}: ${msg}`)
    }
  }

  return NextResponse.json({
    inserted: created.length,
    errors,
  })
}
