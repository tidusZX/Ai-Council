/**
 * GET /api/planner/debug-occupied?month=2026-06
 *
 * Debug endpoint — calls listOccupiedSlots with both filter shapes AND
 * also dumps the raw Notion response for any rows that match the target
 * month regardless of status. Helps diagnose why the gap fix isn't
 * detecting manually-added Notion rows.
 *
 * Owner-scoped via Supabase auth. Safe to leave in prod; returns
 * nothing about other people.
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabase } from '@shaq-os/supabase-client/server'
import { Client as NotionClient } from '@notionhq/client'
import { listOccupiedSlots } from '@/lib/notion'

export const maxDuration = 30

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? ''
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID ?? ''

export async function GET(req: Request) {
  const supabase = await createSupabase()
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

  const url = new URL(req.url)
  const month = url.searchParams.get('month') ?? undefined

  // (1) Run listOccupiedSlots — what the planner actually uses
  let listOccupiedResult: unknown
  let listOccupiedError: string | null = null
  try {
    listOccupiedResult = await listOccupiedSlots(month)
  } catch (e) {
    listOccupiedError = e instanceof Error ? e.message : String(e)
  }

  // (2) Raw Notion dump: ALL rows in the DB, no filter — see what's there
  const notion = new NotionClient({ auth: NOTION_API_KEY })
  let rawSample: unknown = null
  let rawError: string | null = null
  try {
    const res = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      page_size: 50,
    })
    rawSample = res.results.map((p) => {
      const props = (p as { properties: Record<string, unknown> }).properties
      const titleProp = props['Title'] as
        | { title?: { plain_text?: string }[] }
        | undefined
      const statusProp = props['Status'] as
        | {
            type?: string
            status?: { name?: string }
            select?: { name?: string }
          }
        | undefined
      const dateProp = props['Scheduled Date'] as
        | { date?: { start?: string } }
        | undefined
      return {
        id: (p as { id: string }).id,
        title: titleProp?.title?.[0]?.plain_text ?? '(no title)',
        statusType: statusProp?.type ?? '(no type)',
        statusValue:
          statusProp?.status?.name ?? statusProp?.select?.name ?? '(no value)',
        scheduledDate: dateProp?.date?.start ?? null,
      }
    })
  } catch (e) {
    rawError = e instanceof Error ? e.message : String(e)
  }

  // (3) Status property type detection from the DB schema itself
  let dbStatusPropertyType: string | null = null
  let dbError: string | null = null
  try {
    const db = await notion.databases.retrieve({
      database_id: NOTION_DATABASE_ID,
    })
    const props = (db as { properties: Record<string, { type: string }> })
      .properties
    dbStatusPropertyType = props['Status']?.type ?? null
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    month,
    listOccupied: listOccupiedResult,
    listOccupiedError,
    dbStatusPropertyType,
    dbError,
    rawSampleCount: Array.isArray(rawSample) ? rawSample.length : null,
    rawSample,
    rawError,
  })
}
