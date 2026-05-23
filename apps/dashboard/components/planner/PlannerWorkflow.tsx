'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PostingPlanCard } from './PostingPlanCard'
import { PlanSkeleton } from './PlanSkeleton'

type Candidate = {
  ideaId: string
  title: string
  format: 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'
  client: string | null
  shootName: string | null
  hook: string
  draftCaption: string
  postabilityScore: number
  notionPageId: string
}

type Pick = {
  ideaId: string
  weekNumber: number
  slotInWeek: number
  scores: {
    icp_signal: number
    proof_density: number
    format_leverage: number
    total: number
  }
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

type Phase = 'idle' | 'fetching' | 'planning' | 'preview' | 'approving' | 'done'

function defaultMonthLabel(): string {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return next.toLocaleString('default', { month: 'long', year: 'numeric' })
}

function computeScheduledDate(
  monthLabel: string,
  weekNumber: number,
  slotInWeek: number
): string {
  // Parse "Month YYYY"
  const date = new Date(`${monthLabel} 1`)
  const year = date.getFullYear()
  const month = date.getMonth()
  const dayOfMonth = Math.min(
    28,
    Math.max(1, (weekNumber - 1) * 7 + slotInWeek * 3)
  )
  const d = new Date(year, month, dayOfMonth)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function PlannerWorkflow() {
  const router = useRouter()
  const [monthLabel, setMonthLabel] = useState(defaultMonthLabel())
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [approveResult, setApproveResult] = useState<{
    updated: number
    skipped: number
    errors: string[]
  } | null>(null)

  async function runPlan() {
    setError(null)
    setPlan(null)
    setApproveResult(null)
    setSessionId(null)
    setPhase('fetching')

    try {
      const candRes = await fetch('/api/planner/candidates', { method: 'GET' })
      const candBody = await candRes.json().catch(() => null)
      if (!candRes.ok || !candBody?.candidates) {
        throw new Error(candBody?.message || candBody?.error || 'failed to load candidates')
      }
      const fetched: Candidate[] = candBody.candidates
      setCandidates(fetched)

      if (fetched.length < 5) {
        throw new Error(
          `Only ${fetched.length} candidates in Notion with Status="Idea" — need at least 5 to plan a month. Generate more via the Photo Qualifier, or change some Notion rows back to Status="Idea".`
        )
      }

      setPhase('planning')
      const runRes = await fetch('/api/planner/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          monthLabel,
          candidates: fetched.map((c) => ({
            ideaId: c.ideaId,
            title: c.title,
            format: c.format,
            client: c.client,
            shootName: c.shootName,
            hook: c.hook,
            draftCaption: c.draftCaption.slice(0, 500),
            postabilityScore: c.postabilityScore,
          })),
        }),
      })
      const runBody = await runRes.json().catch(() => null)
      if (!runRes.ok || !runBody?.plan) {
        throw new Error(runBody?.message || runBody?.error || 'plan generation failed')
      }
      setPlan(runBody.plan as Plan)
      setSessionId(runBody.sessionId ?? null)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  async function approvePlan() {
    if (!plan || !sessionId) return
    setError(null)
    setPhase('approving')

    try {
      const candidateById = new Map(candidates.map((c) => [c.ideaId, c]))
      const picks = plan.picks
        .map((p) => {
          const cand = candidateById.get(p.ideaId)
          if (!cand) return null
          return {
            ideaId: p.ideaId,
            notionPageId: cand.notionPageId,
            finalCaption: p.finalCaption,
            scheduledDate: computeScheduledDate(
              monthLabel,
              p.weekNumber,
              p.slotInWeek
            ),
            scores: p.scores,
            arcPosition: p.arcPosition,
            hasConversionHook: p.hasConversionHook,
            isFirstPostCandidate: p.isFirstPostCandidate,
          }
        })
        .filter(Boolean)

      if (picks.length === 0) {
        throw new Error('No picks matched candidate notionPageIds — refresh and try again.')
      }

      const res = await fetch('/api/planner/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, picks }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || 'approval failed')
      }
      setApproveResult(body as { updated: number; skipped: number; errors: string[] })
      setPhase('done')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('preview')
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium text-zinc-700 w-32">
            Plan for
          </label>
          <Input
            value={monthLabel}
            onChange={(e) => setMonthLabel(e.target.value)}
            placeholder="e.g. June 2026"
            disabled={phase !== 'idle' && phase !== 'preview' && phase !== 'done'}
            className="flex-1"
          />
          <Button
            type="button"
            onClick={runPlan}
            disabled={phase === 'fetching' || phase === 'planning' || phase === 'approving'}
          >
            {phase === 'fetching'
              ? 'Reading Notion…'
              : phase === 'planning'
                ? 'Planning… (~30–60s)'
                : phase === 'preview' || phase === 'done'
                  ? 'Re-plan'
                  : 'Plan next month'}
          </Button>
        </div>
        <p className="text-xs text-zinc-400">
          Pulls Notion rows with Status="Idea" → Council-rubric scoring →
          structured plan. Approve to write Status="Planned" + final captions
          back to Notion.
        </p>
        {candidates.length > 0 && phase !== 'fetching' ? (
          <p className="text-xs text-zinc-500">
            {candidates.length} candidates loaded from Notion
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {!plan && (phase === 'fetching' || phase === 'planning') ? (
        <PlanSkeleton />
      ) : null}

      {plan ? (
        <>
          <PostingPlanCard payload={plan} />

          {phase === 'preview' || phase === 'approving' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Approve plan and write back to Notion?
                </p>
                <p className="text-xs text-emerald-800 mt-1">
                  Updates each Notion row: Status → "Planned", Draft Caption →
                  final caption from the plan. Scheduled dates are spread across
                  the month based on week + slot.
                </p>
              </div>
              <Button
                type="button"
                onClick={approvePlan}
                disabled={phase === 'approving'}
              >
                {phase === 'approving' ? 'Writing to Notion…' : 'Approve plan'}
              </Button>
            </div>
          ) : null}

          {approveResult ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-5">
              <p className="text-sm font-semibold text-emerald-900">
                ✅ {approveResult.updated} Notion pages updated
                {approveResult.skipped
                  ? ` · ${approveResult.skipped} skipped`
                  : ''}
              </p>
              {approveResult.errors.length ? (
                <ul className="text-xs text-emerald-900 mt-2 space-y-1">
                  {approveResult.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-emerald-800 mt-2">
                Open your Notion DB and filter by Status="Planned" to see them.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
