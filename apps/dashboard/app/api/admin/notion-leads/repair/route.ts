/**
 * POST /api/admin/notion-leads/repair — one-shot schema fix.
 *
 * Brings the Notion Leads DB schema in line with what notion-leads.ts
 * writes. Specifically:
 *   - Renames the title property to "Business name" if it's anything else
 *   - Adds any missing columns (Suggested action, IG handle, Fit reasons,
 *     Discovery source, plus any others the code expects)
 *   - Leaves existing columns alone — non-destructive
 *
 * Idempotent: safe to call multiple times.
 */
import { NextResponse } from 'next/server'
import { Client } from '@notionhq/client'
import { createClient } from '@shaq-os/supabase-client/server'

export const maxDuration = 30

const NOTION_API_KEY = process.env.NOTION_API_KEY ?? ''
const NOTION_LEADS_DATABASE_ID = process.env.NOTION_LEADS_DATABASE_ID ?? ''

// Mirror the columns notion-leads.ts:buildProperties writes.
type PropertyAdd =
  | { type: 'rich_text' }
  | { type: 'url' }
  | { type: 'number' }
  | { type: 'date' }
  | { type: 'select'; options: { name: string; color: string }[] }

const EXPECTED: Record<string, PropertyAdd> = {
  Score: { type: 'number' },
  Tier: {
    type: 'select',
    options: [
      { name: 'first_call', color: 'green' },
      { name: 'strong', color: 'blue' },
      { name: 'maybe', color: 'yellow' },
      { name: 'unlikely', color: 'orange' },
      { name: 'disqualified', color: 'red' },
    ],
  },
  'Suggested action': {
    type: 'select',
    options: [
      { name: 'pursue', color: 'green' },
      { name: 'pursue_after_signal', color: 'blue' },
      { name: 'watch', color: 'yellow' },
      { name: 'archive', color: 'gray' },
    ],
  },
  Status: {
    type: 'select',
    options: [
      { name: 'New', color: 'blue' },
      { name: 'Pursuing', color: 'yellow' },
      { name: "DM'd", color: 'purple' },
      { name: 'Replied', color: 'green' },
      { name: 'Pass', color: 'gray' },
      { name: 'Closed', color: 'red' },
    ],
  },
  'IG handle': { type: 'rich_text' },
  Website: { type: 'url' },
  'Maps URL': { type: 'url' },
  Location: { type: 'rich_text' },
  Rationale: { type: 'rich_text' },
  'Fit reasons': { type: 'rich_text' },
  Disqualifiers: { type: 'rich_text' },
  'Discovery source': { type: 'rich_text' },
  'Supabase ID': { type: 'rich_text' },
  Created: { type: 'date' },
}

function buildPropertyConfig(add: PropertyAdd) {
  switch (add.type) {
    case 'rich_text':
      return { rich_text: {} }
    case 'url':
      return { url: {} }
    case 'number':
      return { number: { format: 'number' as const } }
    case 'date':
      return { date: {} }
    case 'select':
      return { select: { options: add.options } }
  }
}

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!NOTION_API_KEY || !NOTION_LEADS_DATABASE_ID) {
    return NextResponse.json(
      {
        error: 'NOTION_API_KEY or NOTION_LEADS_DATABASE_ID not set',
      },
      { status: 503 }
    )
  }

  const notion = new Client({ auth: NOTION_API_KEY })

  // 1. Fetch current schema.
  let db
  try {
    db = await notion.databases.retrieve({
      database_id: NOTION_LEADS_DATABASE_ID,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'failed to retrieve database', message },
      { status: 502 }
    )
  }

  const currentProps = (db as { properties: Record<string, { type: string }> })
    .properties
  const currentNames = new Set(Object.keys(currentProps))

  // 2. Figure out what to do.
  const titleEntry = Object.entries(currentProps).find(
    ([, p]) => p.type === 'title'
  )
  const titleName = titleEntry?.[0]
  const needsTitleRename = titleName && titleName !== 'Business name'

  const toAdd: string[] = []
  for (const expectedName of Object.keys(EXPECTED)) {
    if (!currentNames.has(expectedName)) {
      toAdd.push(expectedName)
    }
  }

  // 3. Build the properties patch payload.
  // Notion update API accepts a properties map: old-name → new config (rename)
  // OR new-name → config (add). null removes. We don't remove anything.
  const properties: Record<string, unknown> = {}
  if (needsTitleRename) {
    properties[titleName!] = { name: 'Business name' }
  }
  for (const name of toAdd) {
    properties[name] = buildPropertyConfig(EXPECTED[name])
  }

  if (Object.keys(properties).length === 0) {
    return NextResponse.json({
      ok: true,
      changed: false,
      message: 'schema already in sync',
      currentColumns: Object.keys(currentProps).sort(),
    })
  }

  // 4. Apply.
  try {
    await notion.databases.update({
      database_id: NOTION_LEADS_DATABASE_ID,
      properties: properties as Parameters<
        Client['databases']['update']
      >[0]['properties'],
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: 'failed to update database', message, attempted: properties },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    changed: true,
    renamed: needsTitleRename ? { from: titleName, to: 'Business name' } : null,
    added: toAdd,
  })
}
