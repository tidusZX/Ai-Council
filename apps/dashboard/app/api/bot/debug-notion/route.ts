import { NextResponse } from 'next/server'
export async function GET(req: Request) {
  const key = req.headers.get('x-setup-token')
  if (!key || key !== (process.env.SETUP_TOKEN ?? '')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const notionKey = process.env.NOTION_API_KEY ?? ''
  const yapDbId = process.env.NOTION_YAP_DATABASE_ID ?? 'NOT_SET'
  const res = await fetch(`https://api.notion.com/v1/databases/${yapDbId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${notionKey}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
    body: JSON.stringify({ page_size: 10 }),
  })
  const data = await res.json()
  const results = (data as { results?: { properties: { Title?: { title?: { plain_text: string }[] } } }[] }).results ?? []
  return NextResponse.json({ yapDbId, count: results.length, titles: results.map(r => r.properties?.Title?.title?.[0]?.plain_text ?? '?'), status: res.status, message: (data as { message?: string }).message })
}
