import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const key = req.headers.get('x-setup-token')
  if (!key || key !== (process.env.SETUP_TOKEN ?? '')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const notionKey = process.env.NOTION_API_KEY ?? ''
  const yapDbId = process.env.NOTION_YAP_DATABASE_ID ?? 'NOT SET'

  // Query the DB for recent pages
  const res = await fetch(`https://api.notion.com/v1/databases/${yapDbId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ page_size: 5 }),
  })

  const data = await res.json()
  return NextResponse.json({
    yapDbId,
    notionKeySet: Boolean(notionKey),
    queryStatus: res.status,
    pageCount: (data as { results?: unknown[] }).results?.length ?? 0,
    message: (data as { message?: string }).message,
  })
}
