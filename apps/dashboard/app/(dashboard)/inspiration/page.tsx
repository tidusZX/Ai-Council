/**
 * /inspiration — Trend & Inspiration Log
 *
 * Swipe file of viral videos saved via Telegram bot or the form below.
 * Each entry shows keyframes, the Claude analysis, and the Telegram-ready
 * summary. New entries start as 'processing' and update live via polling.
 */
import { createClient } from '@shaq-os/supabase-client/server'
import { InspirationLog } from '@/components/inspiration/InspirationLog'

export const metadata = { title: 'Inspiration — AI Council' }
export const dynamic = 'force-dynamic'

export default async function InspirationPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('inspiration_log')
    .select(
      'id, url, platform, creator_handle, video_title, source, status, summary, analysis, keyframe_urls, error_message, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(50)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initial = error ? [] : ((data ?? []) as any[])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Inspiration Log</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Send a reel to the Telegram bot, or paste a URL below. Claude
          analyses the hook, structure, pacing, and why it works.
        </p>
      </div>
      <InspirationLog initial={initial} />
    </div>
  )
}
