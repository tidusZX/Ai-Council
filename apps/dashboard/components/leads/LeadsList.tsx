'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Lead } from '@shaq-os/database-types'
import { LeadCard } from './LeadCard'
import { Button } from '@/components/ui/Button'

interface DiagnosisShape {
  icpScore?: { score?: number } | null
}

function hasIcpScore(lead: Lead): boolean {
  const d = lead.diagnosis as unknown as DiagnosisShape | null
  return typeof d?.icpScore?.score === 'number'
}

async function withConcurrencyLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  onProgress: (done: number, total: number) => void
): Promise<void> {
  let index = 0
  let done = 0
  const total = items.length
  async function next() {
    while (index < total) {
      const i = index++
      try {
        await worker(items[i])
      } catch {
        // surface individual errors via onProgress / parent state if needed
      }
      done += 1
      onProgress(done, total)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, total) }, () => next())
  )
}

export function LeadsList({ initial }: { initial: Lead[] }) {
  const router = useRouter()
  const [leads] = useState<Lead[]>(initial)
  const [batchScoring, setBatchScoring] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{
    done: number
    total: number
    errors: string[]
  } | null>(null)

  const unscored = leads.filter((l) => !hasIcpScore(l))

  async function batchScoreUnscored() {
    if (unscored.length === 0) return
    const errors: string[] = []
    setBatchScoring(true)
    setBatchProgress({ done: 0, total: unscored.length, errors })

    await withConcurrencyLimit(
      unscored.map((l) => l.id),
      3,
      async (id) => {
        try {
          const res = await fetch(`/api/leads/${id}/score`, { method: 'POST' })
          if (!res.ok) {
            const body = await res.json().catch(() => null)
            errors.push(
              `${id.slice(0, 8)}: ${body?.message || body?.error || `HTTP ${res.status}`}`
            )
          }
        } catch (e) {
          errors.push(
            `${id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
      },
      (done, total) => {
        setBatchProgress({ done, total, errors: [...errors] })
      }
    )

    setBatchScoring(false)
    // Re-fetch the leads list from the server so scores show on cards.
    router.refresh()
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center">
        <p className="text-sm text-zinc-500">
          No leads yet. Add your first one above — paste a Singapore business
          name plus a handful of their IG/website images and Claude will score
          the opportunity.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
          </h2>
          <p className="text-xs text-zinc-400">
            Sorted by opportunity score · {unscored.length} unscored
          </p>
        </div>
        {unscored.length > 0 ? (
          <Button
            type="button"
            onClick={batchScoreUnscored}
            disabled={batchScoring}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {batchScoring && batchProgress
              ? `Scoring ${batchProgress.done}/${batchProgress.total}…`
              : `🎯 Score all ${unscored.length} unscored`}
          </Button>
        ) : null}
      </div>

      {batchScoring && batchProgress ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Scoring {batchProgress.done} of {batchProgress.total} unscored leads
          against ICP. ~3s per lead, concurrency 3 — refresh when done.
        </div>
      ) : null}

      {!batchScoring && batchProgress && batchProgress.errors.length > 0 ? (
        <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <summary className="text-xs font-semibold text-zinc-700 cursor-pointer">
            {batchProgress.errors.length} lead
            {batchProgress.errors.length === 1 ? '' : 's'} errored during batch
            scoring (click to expand)
          </summary>
          <ul className="mt-1 text-xs text-zinc-600 space-y-0.5">
            {batchProgress.errors.map((e, i) => (
              <li key={i}>• {e}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} />
      ))}
    </div>
  )
}
