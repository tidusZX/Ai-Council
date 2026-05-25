/**
 * Notion sync for the Leads database (Plan 13D).
 *
 * Separate Notion DB from the existing content/carousel DB
 * (NOTION_DATABASE_ID). Configured via NOTION_LEADS_DATABASE_ID.
 *
 * Expected DB columns (case-sensitive):
 *   Business name        Title
 *   Score                Number
 *   Tier                 Select  (first_call, strong, maybe, unlikely, disqualified)
 *   Suggested action     Select  (pursue, pursue_after_signal, watch, archive)
 *   Status               Select  (New, Pursuing, Pass, Closed, DM'd, Replied)
 *   IG handle            Rich text
 *   Website              URL
 *   Maps URL             URL
 *   Location             Rich text
 *   Rationale            Rich text
 *   Fit reasons          Rich text
 *   Disqualifiers        Rich text
 *   Discovery source     Rich text
 *   Supabase ID          Rich text   ← dedup key
 *   Created              Date
 */
import { Client } from '@notionhq/client'

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? ''
const NOTION_LEADS_DATABASE_ID = process.env.NOTION_LEADS_DATABASE_ID ?? ''

export function notionLeadsConfigured(): boolean {
  return Boolean(NOTION_API_KEY && NOTION_LEADS_DATABASE_ID)
}

function client(): Client {
  if (!NOTION_API_KEY) throw new Error('NOTION_API_KEY not set')
  return new Client({ auth: NOTION_API_KEY })
}

export interface LeadForNotion {
  id: string
  business_name: string
  ig_handle: string | null
  website: string | null
  location: string | null
  discovery_source: string | null
  discovery_metadata: Record<string, unknown> | null
  diagnosis: Record<string, unknown> | null
  opportunity_score: number | null
  created_at?: string
}

interface IcpScoreShape {
  score?: number
  tier?: string
  fitReasons?: string[]
  disqualifiers?: string[]
  suggestedAction?: string
  rationale?: string
  withVision?: boolean
}

function extractIcp(lead: LeadForNotion): IcpScoreShape {
  const d = lead.diagnosis as Record<string, unknown> | null
  const icp = (d?.icpScore as IcpScoreShape | undefined) ?? {}
  return icp
}

function rt(text: string | null | undefined) {
  if (!text) return { rich_text: [] }
  // Notion rich_text caps at 2000 chars per text block.
  const truncated = text.length > 1900 ? `${text.slice(0, 1900)}…` : text
  return { rich_text: [{ text: { content: truncated } }] }
}

function title(text: string) {
  return { title: [{ text: { content: text.slice(0, 1900) } }] }
}

function select(name: string | null | undefined) {
  if (!name) return { select: null }
  return { select: { name } }
}

function url(value: string | null | undefined) {
  if (!value) return { url: null }
  return { url: value }
}

function num(value: number | null | undefined) {
  return { number: typeof value === 'number' ? value : null }
}

function date(value: string | null | undefined) {
  if (!value) return { date: null }
  return { date: { start: value } }
}

function buildProperties(lead: LeadForNotion) {
  const icp = extractIcp(lead)
  const meta = (lead.discovery_metadata ?? {}) as Record<string, unknown>
  const mapsUrl = typeof meta.maps_url === 'string' ? meta.maps_url : null
  return {
    'Business name': title(lead.business_name),
    Score: num(typeof icp.score === 'number' ? icp.score : null),
    Tier: select(icp.tier ?? null),
    'Suggested action': select(icp.suggestedAction ?? null),
    Status: select('New'),
    'IG handle': rt(lead.ig_handle ?? ''),
    Website: url(lead.website),
    'Maps URL': url(mapsUrl),
    Location: rt(lead.location ?? ''),
    Rationale: rt(icp.rationale ?? ''),
    'Fit reasons': rt((icp.fitReasons ?? []).join(' · ')),
    Disqualifiers: rt((icp.disqualifiers ?? []).join(' · ')),
    'Discovery source': rt(lead.discovery_source ?? ''),
    'Supabase ID': rt(lead.id),
    Created: date(lead.created_at ?? new Date().toISOString()),
  }
}

/**
 * Find an existing Notion page that already mirrors this Supabase lead.
 * Returns the page ID if found, null otherwise.
 */
async function findExistingPage(supabaseId: string): Promise<string | null> {
  try {
    const res = await client().databases.query({
      database_id: NOTION_LEADS_DATABASE_ID,
      filter: {
        property: 'Supabase ID',
        rich_text: { equals: supabaseId },
      },
      page_size: 1,
    })
    return (res.results[0] as { id: string } | undefined)?.id ?? null
  } catch {
    return null
  }
}

export interface PushResult {
  leadId: string
  notionPageId: string | null
  error?: string
}

/**
 * Push a single lead to Notion. Creates a new page or updates the
 * existing one keyed by Supabase ID. Returns the Notion page ID on
 * success, null + error on failure (never throws).
 */
export async function pushLeadToNotion(
  lead: LeadForNotion
): Promise<PushResult> {
  if (!notionLeadsConfigured()) {
    return { leadId: lead.id, notionPageId: null, error: 'not_configured' }
  }
  try {
    const existing = await findExistingPage(lead.id)
    const props = buildProperties(lead)
    if (existing) {
      await client().pages.update({
        page_id: existing,
        properties: props as Parameters<
          Client['pages']['update']
        >[0]['properties'],
      })
      return { leadId: lead.id, notionPageId: existing }
    }
    const page = await client().pages.create({
      parent: { database_id: NOTION_LEADS_DATABASE_ID },
      properties: props as Parameters<
        Client['pages']['create']
      >[0]['properties'],
    })
    return { leadId: lead.id, notionPageId: (page as { id: string }).id }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { leadId: lead.id, notionPageId: null, error: message }
  }
}

/**
 * Bulk push. Runs in parallel batches of 3 to stay under Notion's
 * ~3 req/s soft limit. Returns one PushResult per lead.
 */
export async function pushLeadsToNotion(
  leads: LeadForNotion[]
): Promise<PushResult[]> {
  if (!notionLeadsConfigured()) {
    return leads.map((l) => ({
      leadId: l.id,
      notionPageId: null,
      error: 'not_configured',
    }))
  }
  const results: PushResult[] = []
  for (let i = 0; i < leads.length; i += 3) {
    const batch = leads.slice(i, i + 3)
    const batchResults = await Promise.all(batch.map(pushLeadToNotion))
    results.push(...batchResults)
  }
  return results
}
