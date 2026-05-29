/**
 * GET /api/bot/setup-yap-db
 *
 * One-shot endpoint. Creates the Notion Yap Log database and returns its ID.
 * Run once, add the returned ID as NOTION_YAP_DATABASE_ID in Vercel, redeploy.
 *
 * Auth: x-bot-api-key.
 * Safe to call multiple times — checks if a DB with this name already exists
 * under the parent page.
 */
import { NextResponse } from 'next/server'

const BOT_KEY =
  process.env.BOT_API_KEY ??
  process.env.TELEGRAM_BOT_API_KEY ??
  ''

// Parent: use the content DB's own parent — the integration already has access there.
// Falls back to NOTION_DATABASE_ID's parent if PARENT_PAGE_ID override is set via query.
const FALLBACK_PARENT = process.env.NOTION_DATABASE_ID ?? ''

export async function GET(req: Request) {
  const incomingKey = req.headers.get('x-bot-api-key') ?? req.headers.get('x-setup-token')
  const setupToken = process.env.SETUP_TOKEN ?? ''
  const validKey = (BOT_KEY && incomingKey === BOT_KEY) || (setupToken && incomingKey === setupToken)
  if (!validKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const notionKey = process.env.NOTION_API_KEY ?? ''
  if (!notionKey) {
    return NextResponse.json({ error: 'NOTION_API_KEY not set' }, { status: 503 })
  }

  // Find a page the integration can access by looking at the content DB's parent
  const url = new URL(req.url)
  const parentOverride = url.searchParams.get('parent')

  let parentId = parentOverride ?? ''
  if (!parentId && FALLBACK_PARENT) {
    // Get the content DB to find its parent page
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${FALLBACK_PARENT}`, {
      headers: { Authorization: `Bearer ${notionKey}`, 'Notion-Version': '2022-06-28' },
    })
    if (dbRes.ok) {
      const db = await dbRes.json() as { parent?: { type?: string; page_id?: string; database_id?: string } }
      parentId = db.parent?.page_id ?? db.parent?.database_id ?? ''
    }
  }

  if (!parentId) {
    return NextResponse.json({
      error: 'No parent page found. Pass ?parent=<page_id> to specify.',
    }, { status: 400 })
  }

  const parentType = parentId.length === 32 || parentId.includes('-') ? 'page_id' : 'database_id'

  const res = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      is_inline: true,
      parent: { type: parentType, [parentType]: parentId },
      title: [{ type: 'text', text: { content: 'Yap Log' } }],
      properties: {
        Title: { title: {} },
        'Raw Yap': { rich_text: {} },
        'Cleaned Thought': { rich_text: {} },
        Type: {
          select: {
            options: [
              { name: 'Content idea', color: 'blue' },
              { name: 'Question', color: 'gray' },
              { name: 'Rant', color: 'red' },
              { name: 'Observation', color: 'yellow' },
              { name: 'Story', color: 'green' },
              { name: 'Personal reflection', color: 'purple' },
              { name: 'Business idea', color: 'orange' },
              { name: 'Draft', color: 'brown' },
            ],
          },
        },
        Topics: {
          multi_select: {
            options: [
              { name: 'Singapore', color: 'blue' },
              { name: 'Photography', color: 'green' },
              { name: 'F&B', color: 'orange' },
              { name: 'Product brands', color: 'yellow' },
              { name: 'Creative work', color: 'purple' },
              { name: 'Identity', color: 'pink' },
              { name: 'Money', color: 'red' },
              { name: 'Social media', color: 'gray' },
              { name: 'Culture', color: 'brown' },
              { name: 'Personal', color: 'default' },
            ],
          },
        },
        'Content Potential': {
          select: {
            options: [
              { name: 'High', color: 'green' },
              { name: 'Medium', color: 'yellow' },
              { name: 'Low', color: 'gray' },
            ],
          },
        },
        'Suggested Angle': { rich_text: {} },
        'Hook Ideas': { rich_text: {} },
        Format: {
          multi_select: {
            options: [
              { name: 'TikTok', color: 'red' },
              { name: 'IG caption', color: 'pink' },
              { name: 'Carousel', color: 'blue' },
              { name: 'Longform', color: 'purple' },
              { name: 'Voice note', color: 'orange' },
              { name: 'Tweet', color: 'gray' },
            ],
          },
        },
        Status: { status: {} },
        Source: {
          select: {
            options: [
              { name: 'Telegram', color: 'blue' },
              { name: 'Dashboard', color: 'gray' },
            ],
          },
        },
        Created: { date: {} },
        Posted: { checkbox: {} },
      },
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json(
      { error: 'Notion create failed', message: data.message, status: res.status },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    database_id: data.id,
    message: `Yap Log created. Add NOTION_YAP_DATABASE_ID=${data.id} to Vercel env vars and redeploy.`,
  })
}
