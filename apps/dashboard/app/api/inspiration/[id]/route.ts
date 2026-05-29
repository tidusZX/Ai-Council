/**
 * GET /api/inspiration/[id] — poll a single entry.
 *
 * Two auth paths:
 *  1. Telegram bot polling — x-bot-api-key header (BOT_API_KEY / INSPIRATION_BOT_API_KEY / TELEGRAM_BOT_API_KEY)
 *  2. Dashboard user — normal Supabase session cookie
 *
 * Response shape:
 *   { id, status: 'processing' | 'complete' | 'failed', summary?, analysis?, error_message? }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'
import { createServiceNodeClient } from '@shaq-os/supabase-client/service-node'

const BOT_KEY =
  process.env.BOT_API_KEY ??
  process.env.INSPIRATION_BOT_API_KEY ??
  process.env.TELEGRAM_BOT_API_KEY ??
  ''

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

  // Bot auth path — service-role reads bypass RLS
  const incomingKey = req.headers.get('x-bot-api-key')
  if (BOT_KEY && incomingKey === BOT_KEY) {
    const service = createServiceNodeClient()
    const { data, error } = await service
      .from('inspiration_log')
      .select(
        'id, url, platform, creator_handle, video_title, source, status, summary, analysis, keyframe_urls, error_message, created_at'
      )
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    if (data.status === 'complete' && !data.summary && data.analysis) {
      const summary = buildSummary(data.analysis as Record<string, unknown>)
      if (summary) {
        await service.from('inspiration_log').update({ summary }).eq('id', id)
        data.summary = summary
      }
    }

    return NextResponse.json(data)
  }

  // Dashboard auth path — scoped to owner
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('inspiration_log')
    .select(
      'id, url, platform, creator_handle, video_title, source, status, summary, analysis, keyframe_urls, error_message, created_at'
    )
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  if (data.status === 'complete' && !data.summary && data.analysis) {
    const summary = buildSummary(data.analysis as Record<string, unknown>)
    if (summary) {
      await supabase.from('inspiration_log').update({ summary }).eq('id', id)
      data.summary = summary
    }
  }

  return NextResponse.json(data)
}

function buildSummary(analysis: Record<string, unknown>): string | null {
  const parts: string[] = []
  const hook = typeof analysis.hook === 'string' ? analysis.hook.trim() : null
  if (hook) parts.push(`📌 Hook: ${hook}`)
  const hypotheses = Array.isArray(analysis.hypothesized_why_it_works)
    ? (analysis.hypothesized_why_it_works as string[]).slice(0, 2).join(' ')
    : null
  if (hypotheses) parts.push(`💡 Why it works: ${hypotheses}`)
  const risk = Array.isArray(analysis.risks_if_replicated)
    ? (analysis.risks_if_replicated as string[])[0]
    : null
  if (risk) parts.push(`⚠️ Watch out: ${risk}`)
  return parts.length > 0 ? parts.join('\n\n') : null
}
