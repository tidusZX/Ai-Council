/**
 * GET /api/inspiration/[id] — poll a single entry.
 *
 * Used by the Telegram bot to check if analysis is complete.
 * Returns status + summary (when complete) so the bot can send
 * the reply back to the user's chat.
 *
 * Response shape:
 *   { id, status: 'processing' | 'complete' | 'failed', summary?, analysis?, error_message? }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params

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

  // If analysis is complete and the video_analyses pipeline has written back,
  // but our summary is still null (e.g. legacy row), generate it on demand.
  if (data.status === 'complete' && !data.summary && data.analysis) {
    const summary = buildSummary(data.analysis as Record<string, unknown>)
    if (summary) {
      await supabase
        .from('inspiration_log')
        .update({ summary })
        .eq('id', id)
      data.summary = summary
    }
  }

  return NextResponse.json(data)
}

/**
 * Build a concise 2-3 sentence Telegram-friendly summary from the
 * Claude analysis output. No extra LLM call — just formats the key fields.
 *
 * Format:
 *   Hook: <hook>
 *   Why it works: <hypothesis 1>. <hypothesis 2>.
 *   Watch out: <risk 1>.
 */
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
