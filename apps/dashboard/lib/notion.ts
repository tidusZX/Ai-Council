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
type NotionFile =
  | { type: 'external'; name?: string; external: { url: string } }
  | { type: 'file'; name?: string; file: { url: string; expiry_time?: string } }
type NotionPageProps = Record<
  string,
  | { type: 'title'; title: RichText[] }
  | { type: 'rich_text'; rich_text: RichText[] }
  | { type: 'select'; select: { name: string } | null }
  | { type: 'status'; status: { name: string } | null }
  | { type: 'multi_select'; multi_select: { name: string }[] }
  | { type: 'number'; number: number | null }
  | { type: 'url'; url: string | null }
  | { type: 'date'; date: { start: string } | null }
  | { type: 'files'; files: NotionFile[] }
  | undefined
>

function plain(p: NotionPageProps[string]): string {
  if (!p) return ''
  if (p.type === 'title') return p.title.map((t) => t.plain_text).join('')
  if (p.type === 'rich_text') return p.rich_text.map((t) => t.plain_text).join('')
  return ''
}

function selectName(p: NotionPageProps[string]): string | null {
  if (!p) return null
  // Handle both Select-type and Status-type properties — Shaq's Status
  // column is the ◯ Status type, but the legacy code assumed Select.
  if (p.type === 'select') return p.select?.name ?? null
  if (p.type === 'status') return p.status?.name ?? null
  return null
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

function filesUrls(p: NotionPageProps[string]): string[] {
  if (!p || p.type !== 'files') return []
  return p.files
    .map((f) => (f.type === 'external' ? f.external.url : f.file.url))
    .filter((u): u is string => Boolean(u))
}

// Drive `/file/d/<id>/view` URLs return an HTML preview page when fetched
// by a media client (Blotato). The `uc?export=download&id=<id>` form 303s
// to drive.usercontent.google.com which serves the raw bytes. Idempotent —
// passes through anything that isn't a Drive file URL.
export function toDriveDownloadUrl(url: string): string {
  const m = url.match(/\/file\/d\/([^/]+)/)
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url
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

export interface NotionPageForPush {
  pageId: string
  title: string
  status: string
  caption: string
  // Carousel-ready: every external URL from the Image (Files & media)
  // column, in slide order, with Drive view-URLs transformed into their
  // direct-download form. Empty for posts without media.
  imageUrls: string[]
  client: string | null
  // ISO yyyy-mm-dd from the Notion `Scheduled Date` column, or null if
  // unset. Push-to-Blotato uses this to derive scheduledTime; rows with
  // no date fall through to Blotato's next-free-slot queue.
  scheduledDate: string | null
}

/**
 * Fetch a single Notion page and extract just the fields we need to push to
 * Blotato. Used by /api/posts/[id]/push-to-blotato so the backend reads the
 * canonical caption from Notion, not whatever the frontend sent.
 */
export async function fetchNotionPageForPush(
  pageId: string
): Promise<NotionPageForPush> {
  const notion = client()
  const page = await notion.pages.retrieve({ page_id: pageId })
  const p = (page as { properties: NotionPageProps }).properties
  // Prefer Image (Files & media, multi). Fall back to Drive Link (URL,
  // single) for older rows written before the schema flip.
  const filesFromImage = filesUrls(p['Image']).map(toDriveDownloadUrl)
  const legacySingle = urlVal(p['Drive Link'])
  const imageUrls =
    filesFromImage.length > 0
      ? filesFromImage
      : legacySingle
        ? [toDriveDownloadUrl(legacySingle)]
        : []
  return {
    pageId,
    title: plain(p['Title']),
    status: selectName(p['Status']) ?? '',
    caption: plain(p['Draft Caption']),
    imageUrls,
    client: selectName(p['Client']),
    scheduledDate: dateVal(p['Scheduled Date']),
  }
}

/**
 * Mark a row as Scheduled after a successful Blotato push. Stores the
 * Blotato submission ID in the Note field for traceability (no new column
 * required).
 */
/**
 * Note about the Blotato submission ID: we deliberately don't write it back
 * to a Notion column because that would require Shaq to add a new column to
 * his DB. The submission ID is logged in the API response + Vercel logs if
 * needed for debugging. Status flip alone is the visible artifact.
 */
export async function markRowScheduled(pageId: string): Promise<void> {
  const notion = client()
  await notion.pages.update({
    page_id: pageId,
    properties: {
      Status: { select: { name: 'Scheduled' } },
    },
  })
}

/**
 * List rows with Status in the given set, sorted by Week. Used by the
 * /scheduled-pipeline page.
 */
export async function listRowsByStatus(
  statuses: string[]
): Promise<NotionCandidate[]> {
  if (!NOTION_DATABASE_ID) throw new Error('NOTION_DATABASE_ID not set')
  const notion = client()
  const out: NotionCandidate[] = []
  let cursor: string | undefined

  do {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        or: statuses.map((status) => ({
          property: 'Status',
          select: { equals: status },
        })),
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

export interface OccupiedSlot {
  notionPageId: string
  title: string
  status: string
  weekNumber: number | null
  scheduledDate: string | null
}

function dateVal(p: NotionPageProps[string]): string | null {
  if (!p || p.type !== 'date') return null
  return p.date?.start ?? null
}

/**
 * Returns rows already locked into the month — Status ∈ Planned /
 * Scheduled / Posted / Published. Used by /api/planner/run to subtract
 * from the 10-post target and surface which week slots are already
 * occupied so the planner doesn't double-book.
 *
 * If `monthYYYYMM` is provided (format 'YYYY-MM'), filters to that month
 * by Scheduled Date prefix. Rows in target statuses with NO Scheduled
 * Date are excluded when monthYYYYMM is set (can't tell what month they
 * belong to). If not, returns everything in those statuses.
 *
 * Auto-detects the Status property type (select vs status) from the DB
 * schema and uses the matching filter shape.
 */
export async function listOccupiedSlots(
  monthYYYYMM?: string
): Promise<OccupiedSlot[]> {
  if (!NOTION_DATABASE_ID) throw new Error('NOTION_DATABASE_ID not set')
  const notion = client()

  // Must match the actual option names in Shaq's Notion DB:
  // Idea / Drafting / Scheduled / Posted / Skip / Planned.
  // Notion's filter is strict — querying a non-existent option errors the
  // whole query. Keep this list aligned with the DB's Status options.
  const targetStatuses = ['Planned', 'Scheduled', 'Posted']

  // Detect property type once; cheap call, prevents wasted retries.
  let statusPropertyType: 'select' | 'status' = 'select'
  try {
    const db = await notion.databases.retrieve({
      database_id: NOTION_DATABASE_ID,
    })
    const props = (db as { properties: Record<string, { type: string }> })
      .properties
    if (props['Status']?.type === 'status') statusPropertyType = 'status'
  } catch {
    // If retrieve fails, fall back to select — the dominant case in this DB.
  }

  const filters = targetStatuses.map((status) =>
    statusPropertyType === 'status'
      ? { property: 'Status', status: { equals: status } }
      : { property: 'Status', select: { equals: status } }
  )

  const out: OccupiedSlot[] = []
  let cursor: string | undefined
  do {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: { or: filters } as unknown as Parameters<
        typeof notion.databases.query
      >[0]['filter'],
      page_size: 100,
      start_cursor: cursor,
    })

    for (const page of res.results) {
      const p = (page as { properties: NotionPageProps }).properties
      const scheduledDate = dateVal(p['Scheduled Date'])

      // Month filter: if monthYYYYMM is provided, require the date to match.
      // Rows with no Scheduled Date are excluded when monthYYYYMM is set —
      // we can't tell what month they belong to, so excluding is safer than
      // counting them against the target month's cap.
      if (monthYYYYMM) {
        if (!scheduledDate || !scheduledDate.startsWith(monthYYYYMM)) continue
      }

      out.push({
        notionPageId: (page as { id: string }).id,
        title: plain(p['Title']),
        status: selectName(p['Status']) ?? '',
        weekNumber: numberVal(p['Week']),
        scheduledDate,
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
          'Scheduled Date': {
            date: { start: pick.scheduledDate },
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
