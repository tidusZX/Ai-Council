'use client'

import { useState } from 'react'

type Scores = {
  icp_signal: number
  proof_density: number
  format_leverage: number
  total: number
}

type Pick = {
  ideaId: string
  weekNumber: number
  slotInWeek: number
  scores: Scores
  isFirstPostCandidate: boolean
  arcPosition: 'credibility_anchor' | 'proof' | 'process' | 'soft_cta'
  hasConversionHook: boolean
  finalCaption: string
  whyPicked: string
}

type Plan = {
  summary: string
  picks: Pick[]
  formatMix?: { carousels: number; singles: number; educational: number }
  clientDiversity?: { client: string; count: number }[]
  conversionHookCount: number
  droppedCount?: number
}

const ARC_LABEL: Record<Pick['arcPosition'], string> = {
  credibility_anchor: 'Credibility anchor',
  proof: 'Proof',
  process: 'Process',
  soft_cta: 'Soft CTA',
}

const ARC_COLOR: Record<Pick['arcPosition'], string> = {
  credibility_anchor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  proof: 'bg-blue-50 text-blue-700 border-blue-200',
  process: 'bg-amber-50 text-amber-700 border-amber-200',
  soft_cta: 'bg-purple-50 text-purple-700 border-purple-200',
}

function scoreColor(total: number) {
  if (total >= 7) return 'text-emerald-700'
  if (total >= 5) return 'text-amber-700'
  return 'text-rose-700'
}

interface PostingPlanCardProps {
  payload: unknown
  /**
   * When true, each slot gets a "Discuss this slot" button that pre-fills
   * the RoundsThread input via a window CustomEvent. Only enable when a
   * RoundsThread is mounted on the same page.
   */
  enableDiscuss?: boolean
}

export function PostingPlanCard({ payload, enableDiscuss }: PostingPlanCardProps) {
  const plan = (payload ?? {}) as Plan
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

  function discussSlot(pick: Pick) {
    const text = `Critic, sharpen the ${ARC_LABEL[pick.arcPosition]} pick for week ${pick.weekNumber} slot ${pick.slotInWeek} (ideaId ${pick.ideaId.slice(0, 8)}). Reason it was picked: ${pick.whyPicked}\n\nFinal caption:\n${pick.finalCaption}\n\nWhat would you tighten or push back on?`
    window.dispatchEvent(
      new CustomEvent('council:prefill', {
        detail: { text, addressed: ['critic', 'chairperson'] },
      })
    )
    document
      .getElementById('rounds-thread')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const picksByWeek: Record<number, Pick[]> = {}
  for (const p of plan.picks ?? []) {
    if (!picksByWeek[p.weekNumber]) picksByWeek[p.weekNumber] = []
    picksByWeek[p.weekNumber].push(p)
  }
  const weekNumbers = Object.keys(picksByWeek)
    .map(Number)
    .sort((a, b) => a - b)

  async function copyCaption(idx: number, caption: string) {
    try {
      await navigator.clipboard.writeText(caption)
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx((curr) => (curr === idx ? null : curr)), 1500)
    } catch {
      // noop
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-zinc-900 text-white px-6 py-5">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Monthly Content Plan
        </p>
        <p className="text-sm leading-relaxed text-zinc-100">{plan.summary}</p>
        <div className="mt-3 flex gap-3 flex-wrap text-xs">
          {plan.formatMix ? (
            <span className="px-2 py-1 rounded-md bg-zinc-800 text-zinc-300">
              🎠 {plan.formatMix.carousels} · 🖼 {plan.formatMix.singles}
              {plan.formatMix.educational
                ? ` · 🎓 ${plan.formatMix.educational}`
                : ''}
            </span>
          ) : null}
          <span className="px-2 py-1 rounded-md bg-zinc-800 text-zinc-300">
            🪝 {plan.conversionHookCount} conversion hook
            {plan.conversionHookCount === 1 ? '' : 's'}
          </span>
          {typeof plan.droppedCount === 'number' ? (
            <span className="px-2 py-1 rounded-md bg-zinc-800 text-zinc-400">
              {plan.droppedCount} dropped
            </span>
          ) : null}
        </div>
      </div>

      {weekNumbers.map((weekNum) => {
        const slots = picksByWeek[weekNum].slice().sort((a, b) => a.slotInWeek - b.slotInWeek)
        return (
          <div key={weekNum} className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900">Week {weekNum}</h3>
            <div className="grid gap-3">
              {slots.map((pick) => {
                const idx = plan.picks.indexOf(pick)
                const expanded = expandedIdx === idx
                return (
                  <div
                    key={pick.ideaId + ':' + idx}
                    className="rounded-xl border border-zinc-200 bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md border ${ARC_COLOR[pick.arcPosition]}`}
                          >
                            {ARC_LABEL[pick.arcPosition]}
                          </span>
                          {pick.isFirstPostCandidate ? (
                            <span className="text-xs px-2 py-0.5 rounded-md border bg-rose-50 text-rose-700 border-rose-200">
                              ⚡ First-post candidate
                            </span>
                          ) : null}
                          {pick.hasConversionHook ? (
                            <span className="text-xs px-2 py-0.5 rounded-md border bg-indigo-50 text-indigo-700 border-indigo-200">
                              🪝 Conversion hook
                            </span>
                          ) : null}
                          <span className="text-xs text-zinc-400">
                            slot {pick.slotInWeek} · ideaId {pick.ideaId.slice(0, 8)}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-700 mt-2 italic">{pick.whyPicked}</p>
                      </div>
                      <div className={`text-right ${scoreColor(pick.scores.total)}`}>
                        <div className="text-2xl font-bold tabular-nums">
                          {pick.scores.total}
                          <span className="text-sm text-zinc-400 font-normal">/8</span>
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                          ICP {pick.scores.icp_signal} · Proof {pick.scores.proof_density} · Fmt{' '}
                          {pick.scores.format_leverage}
                        </div>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-4 pt-4 border-t border-zinc-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                            Final caption
                          </span>
                          <button
                            type="button"
                            onClick={() => copyCaption(idx, pick.finalCaption)}
                            className="text-xs px-2 py-1 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                          >
                            {copiedIdx === idx ? 'Copied ✓' : 'Copy'}
                          </button>
                        </div>
                        <p className="text-sm text-zinc-800 whitespace-pre-wrap">
                          {pick.finalCaption}
                        </p>
                      </div>
                    ) : null}

                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setExpandedIdx(expanded ? null : idx)}
                        className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
                      >
                        {expanded ? 'Hide caption' : 'Show caption'}
                      </button>
                      {enableDiscuss ? (
                        <button
                          type="button"
                          onClick={() => discussSlot(pick)}
                          className="text-xs text-indigo-600 hover:text-indigo-900 transition-colors"
                          title="Open this slot in the council follow-up thread"
                        >
                          💬 Discuss this slot
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {plan.clientDiversity && plan.clientDiversity.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-zinc-900 mb-3">
            Client diversity
          </h3>
          <div className="flex flex-wrap gap-2">
            {plan.clientDiversity.map((cd) => (
              <span
                key={cd.client}
                className="text-xs px-2 py-1 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-700"
              >
                {cd.client} · {cd.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
