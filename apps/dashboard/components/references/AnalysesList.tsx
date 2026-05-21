'use client'

import { useEffect, useState } from 'react'
import type { VideoAnalysis } from '@shaq-os/database-types'
import { createClient } from '@shaq-os/supabase-client/client'
import { AnalysisCard } from './AnalysisCard'

const POLL_INTERVAL_MS = 3000

const TERMINAL_STATUSES = new Set(['complete', 'error'])

interface Props {
  initial: VideoAnalysis[]
}

export function AnalysesList({ initial }: Props) {
  const [rows, setRows] = useState<VideoAnalysis[]>(initial)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function poll() {
      const { data, error } = await supabase
        .from('video_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (cancelled) return
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[AnalysesList] poll error:', error.message)
        return
      }
      if (data) setRows(data as VideoAnalysis[])
    }

    function shouldKeepPolling(rows: VideoAnalysis[]) {
      return rows.some((r) => !TERMINAL_STATUSES.has(r.status))
    }

    // Always poll at least once on mount to refresh status, then keep
    // polling while any row is non-terminal.
    poll()
    const interval = setInterval(() => {
      if (!shouldKeepPolling(rows)) return
      poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [rows])

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-200 p-12 text-center">
        <span className="text-4xl block mb-4">🎬</span>
        <h3 className="font-semibold text-zinc-900 mb-2">No analyses yet</h3>
        <p className="text-sm text-zinc-500">
          Paste a TikTok, Instagram Reel, or YouTube Short above to start.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <AnalysisCard key={row.id} analysis={row} />
      ))}
    </div>
  )
}
