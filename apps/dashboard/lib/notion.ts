import { Client } from '@notionhq/client'

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? ''
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? ''

export interface NotionCandidate {
  ideaId: string
  title: string
  format: 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'
  client: string | null
  shootName: string | null
  hook: string
  draftCaption: string
  hashtags: string[]
  postabilityScore: number
  primaryImageId: string | null
  notionPageId: string
}

const FORMAT_MAP: Record<string, NotionCandidate['format']> = {
  '🎠 Carousel': 'CAROUSEL',
  '🖼 Single': 'SINGLE',
  '🎓 Educational': 'EDUCATIONAL',
  '✏️ Re-edit': 'RE-EDIT',
}

function client(): Client {
  if (!NOTION_API_KEY) throw new Error('NOTION_API_KEY not set')
  return new Client({ auth: NOTION_API_KEY })
}

type RichText = { plain_text: string }
type NotionPageProps = Record<
  string,
  | { type: 'title'; title: RichText[] }
  | { type: 'rich_text'; rich_text: RichText[] }
  | { type: 'select'; select: { name: string } | null }
  | { type: 'multi_select'; multi_select: { name: string }[] }
  | { type: 'number'; number: number | null }
  | { type: 'url'; url: string | null }
  | { type: 'date'; date: { start: string } | null }
  | undefined
>

function plain(p: NotionPageProps[string]): string {
  if (!p) return ''
  if (p.type === 'title') return p.title.map((t) => t.plain_text).join('')
  if (p.type === 'rich_text') return p.rich_text.map((t) => t.plain_text).join('')
  return ''
}

function selectName(p: NotionPageProps[string]): string | null {
  if (!p || p.type !== 'select') return null
  return p.select?.name ?? null
}

function multiSelectNames(p: NotionPageProps[string]): string[] {
  if (!p || p.type !== 'multi_select') return []
  return p.multi_select.map((s) => s.name)
}

function numberVal(p: NotionPageProps[string]): number | null {
  if (!p || p.type !== 'number') return null
  return p.number
}

function urlVal(p: NotionPageProps[string]): string | null {
  if (!p || p.type !== 'url') return null
  return p.url
}

/**
 * Fetch all candidate post ideas from the Notion DB with Status="Idea".
 * Maps Notion properties into the shape the planner API expects.
 */
export async function fetchCandidatesFromNotion(): Promise<NotionCandidate[]> {
  if (!NOTION_DATABASE_ID) throw new Error('NOTION_DATABASE_ID not set')
  const notion = client()
  const out: NotionCandidate[] = []
  let cursor: string | undefined

  do {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        property: 'Status',
        select: { equals: 'Idea' },
      },
      page_size: 100,
      start_cursor: cursor,
    })

    for (const page of res.results) {
      const p = (page as { properties: NotionPageProps }).properties
      const formatLabel = selectName(p['Format']) ?? ''
      const format = FORMAT_MAP[formatLabel] ?? 'SINGLE'
      const ideaId = plain(p['Idea Id'])
      if (!ideaId) continue
      const driveLink = urlVal(p['Drive Link'])
      const primaryImageId = driveLink
        ? driveLink.match(/\/file\/d\/([^/]+)/)?.[1] ?? null
        : null

      out.push({
        ideaId,
        title: plain(p['Title']),
        format,
        client: selectName(p['Client']),
        shootName: plain(p['Shoot']) || null,
        hook: plain(p['Hook']),
        draftCaption: plain(p['Draft Caption']),
        hashtags: multiSelectNames(p['Hashtags']),
        postabilityScore: numberVal(p['Postability']) ?? 0,
        primaryImageId,
        notionPageId: (page as { id: string }).id,
      })
    }

    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
  } while (cursor)

  return out
}

export interface PlannerApprovePick {
  ideaId: string
  notionPageId: string
  finalCaption: string
  scheduledDate: string // ISO yyyy-mm-dd
  scores: {
    icp_signal: number
    proof_density: number
    format_leverage: number
    total: number
  }
  arcPosition: string
  hasConversionHook: boolean
  isFirstPostCandidate: boolean
}

/**
 * For each pick, update its Notion page:
 *  - Status: "Idea" → "Planned"
 *  - Draft Caption: replaced with finalCaption
 *  - Week: scheduled week number (already exists as a Number prop)
 *
 * We deliberately keep the property surface minimal — we don't require
 * Shaq to add new columns to his Notion DB. Plan-specific data (scores,
 * arc, hooks) stays in the council_outputs payload.
 */
export async function applyPlanToNotion(
  picks: PlannerApprovePick[]
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const notion = client()
  const errors: string[] = []
  let updated = 0
  let skipped = 0

  for (const pick of picks) {
    try {
      const weekFromDate = (() => {
        const d = new Date(pick.scheduledDate)
        if (Number.isNaN(d.getTime())) return null
        return Math.min(4, Math.max(1, Math.ceil(d.getDate() / 7)))
      })()
      await notion.pages.update({
        page_id: pick.notionPageId,
        properties: {
          Status: { select: { name: 'Planned' } },
          'Draft Caption': {
            rich_text: [
              {
                type: 'text',
                text: { content: pick.finalCaption.slice(0, 2000) },
              },
            ],
          },
          ...(weekFromDate
            ? { Week: { number: weekFromDate } }
            : {}),
        },
      })
      updated += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${pick.ideaId}: ${msg}`)
      skipped += 1
    }
  }

  return { updated, skipped, errors }
}
