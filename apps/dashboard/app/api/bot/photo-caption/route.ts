/**
 * POST /api/bot/photo-caption
 *
 * Accepts a multipart image upload from the Telegram bot and returns
 * 2-3 caption options using Claude vision + Shaq's brand voice.
 *
 * Auth: x-bot-api-key header (BOT_API_KEY / TELEGRAM_BOT_API_KEY).
 * Body: multipart/form-data with `image` (file) + optional `caption` (string).
 * Response: { captions: string[] }
 */
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const BOT_KEY =
  process.env.BOT_API_KEY ??
  process.env.TELEGRAM_BOT_API_KEY ??
  ''

const SYSTEM_PROMPT = [
  'You write Instagram captions for Shaq (@getarchivedsg), a Singapore commercial photographer.',
  'Study the photo and write 2-3 distinct caption options.',
  'Shaq shoots F&B, product, lifestyle, and commercial campaigns in Singapore.',
  'His voice: direct, observational, zero hype words ("elevate", "stunning", "incredible").',
  'Each caption: 15-60 words. No hashtags. End sales posts with "DM SHOOT." only.',
  'Return ONLY a JSON array of strings: ["caption 1", "caption 2", "caption 3"]',
].join(' ')

export const maxDuration = 30

export async function POST(req: Request) {
  const incomingKey = req.headers.get('x-bot-api-key')
  if (!BOT_KEY || incomingKey !== BOT_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  }

  const imageFile = formData.get('image')
  if (!(imageFile instanceof File)) {
    return NextResponse.json({ error: 'image field missing' }, { status: 400 })
  }

  const userCaption = formData.get('caption')?.toString() ?? ''
  const mimeType = imageFile.type || 'image/jpeg'
  const validMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
  type ValidMime = (typeof validMime)[number]
  const mediaType: ValidMime = validMime.includes(mimeType as ValidMime)
    ? (mimeType as ValidMime)
    : 'image/jpeg'

  const bytes = await imageFile.arrayBuffer()
  const b64 = Buffer.from(bytes).toString('base64')

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 503 })
  }

  const client = new Anthropic({ apiKey })

  const userContent: Anthropic.MessageParam['content'] = [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: b64 },
    },
    {
      type: 'text',
      text: userCaption
        ? `User note: ${userCaption}\n\nWrite 2-3 caption options for this photo.`
        : 'Write 2-3 caption options for this photo.',
    },
  ]

  const response = await client.messages.create({
    model: process.env.ANALYSIS_MODEL ?? 'claude-sonnet-4-5',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const text =
    response.content.find((b) => b.type === 'text')?.text?.trim() ?? '[]'

  let captions: string[]
  try {
    const raw = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]')
    captions = Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : []
  } catch {
    // Fallback: split on numbered list
    captions = text
      .split(/\n+/)
      .map((l) => l.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 3)
  }

  return NextResponse.json({ captions })
}
