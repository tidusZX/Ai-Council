'use client'

import { useEffect, useRef, useState } from 'react'
import type { Lead } from '@shaq-os/database-types'

const STATUS_VALUES = [
  'new',
  'qualified',
  'contacted',
  'responded',
  'won',
  'lost',
  'archived',
] as const
type LeadStatus = (typeof STATUS_VALUES)[number]

type ScoreNote = { score: number; notes: string }
type IcpScore = {
  score: number
  tier: 'first_call' | 'strong' | 'maybe' | 'unlikely' | 'disqualified'
  fitReasons: string[]
  disqualifiers: string[]
  suggestedAction: 'pursue' | 'pursue_after_signal' | 'watch' | 'archive'
  rationale: string
  evidenceUsed: {
    sizeSignal: string
    photographyState: string
    icpVerticalMatch: string
  }
  scoredAt?: string
}
type Diagnosis = {
  brand_consistency?: ScoreNote
  image_quality?: ScoreNote
  styling_composition?: ScoreNote
  visual_hierarchy?: ScoreNote
  opportunity_for_shaq?: ScoreNote
  overall_opportunity_score?: number
  top_gaps?: string[]
  red_flags?: string[]
  outreach_angle?: string
  icpScore?: IcpScore
  // Seed-shape fields (from scripts/import-30-prospects.ts) — different
  // schema than the structured visual-brand diagnosis above. Rendered as
  // a fallback when a lead hasn't been through /diagnose-lead yet.
  source?: string
  why_they_fit?: string
  human_outreach_angle?: string
  category?: string
}

const ICP_TIER_COLORS: Record<IcpScore['tier'], string> = {
  first_call: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  strong: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  maybe: 'bg-amber-50 text-amber-700 border-amber-200',
  unlikely: 'bg-zinc-100 text-zinc-600 border-zinc-300',
  disqualified: 'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  qualified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  contacted: 'bg-amber-50 text-amber-700 border-amber-200',
  responded: 'bg-purple-50 text-purple-700 border-purple-200',
  won: 'bg-green-50 text-green-800 border-green-300',
  lost: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  archived: 'bg-zinc-100 text-zinc-400 border-zinc-200',
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-zinc-400'
  if (score >= 80) return 'text-emerald-700'
  if (score >= 60) return 'text-amber-700'
  if (score >= 40) return 'text-orange-700'
  return 'text-rose-700'
}

export function LeadCard({ lead }: { lead: Lead }) {
  const [expanded, setExpanded] = useState(false)
  const [icpExpanded, setIcpExpanded] = useState(false)
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [localDiagnosis, setLocalDiagnosis] = useState<Diagnosis | null>(null)
  const [igPanelOpen, setIgPanelOpen] = useState(false)
  const [igHandleInput, setIgHandleInput] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState<LeadStatus>(
    (lead.status as LeadStatus) ?? 'new'
  )
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const statusMenuRef = useRef<HTMLDivElement>(null)
  const d = localDiagnosis ?? (lead.diagnosis as Diagnosis | null) ?? {}
  const icp = d.icpScore ?? null

  async function runIcpScore() {
    setScoring(true)
    setScoreError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/score`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setLocalDiagnosis({
        ...(d as Diagnosis),
        icpScore: { ...body.verdict, scoredAt: new Date().toISOString() },
      })
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : String(e))
    } finally {
      setScoring(false)
    }
  }

  async function runIgScore() {
    const handle = (igHandleInput || lead.ig_handle || '')
      .trim()
      .replace(/^@/, '')
    if (!handle) {
      setScoreError('Add an IG handle to scrape + score with visuals.')
      return
    }
    setScoring(true)
    setScoreError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/score-with-ig`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ igHandle: handle }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setLocalDiagnosis({
        ...(d as Diagnosis),
        icpScore: {
          ...body.verdict,
          scoredAt: new Date().toISOString(),
        },
      })
      setIgPanelOpen(false)
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : String(e))
    } finally {
      setScoring(false)
    }
  }
  const score = lead.opportunity_score
  const statusClass = STATUS_COLORS[status] ?? STATUS_COLORS.new

  // Close the status menu when clicking outside.
  useEffect(() => {
    if (!statusMenuOpen) return
    function onDocClick(e: MouseEvent) {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(e.target as Node)
      ) {
        setStatusMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [statusMenuOpen])

  async function changeStatus(next: LeadStatus) {
    if (next === status) {
      setStatusMenuOpen(false)
      return
    }
    setStatusError(null)
    setStatusSaving(true)
    const prev = status
    setStatus(next) // optimistic
    setStatusMenuOpen(false)
    try {
      const res = await fetch(`/api/leads/${lead.id}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
    } catch (e) {
      setStatus(prev) // revert
      setStatusError(e instanceof Error ? e.message : String(e))
    } finally {
      setStatusSaving(false)
    }
  }

  async function generateDraft() {
    setDraftLoading(true)
    setDraftError(null)
    try {
      const res = await fetch(`/api/leads/${lead.id}/draft-outreach`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.draft) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setDraft(body.draft)
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e))
    } finally {
      setDraftLoading(false)
    }
  }

  async function copyDraft() {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked — fall through
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-zinc-900">
              {lead.business_name}
            </h3>
            <div className="relative" ref={statusMenuRef}>
              <button
                type="button"
                onClick={() => setStatusMenuOpen((v) => !v)}
                disabled={statusSaving}
                className={`text-xs px-2 py-0.5 rounded-md border transition cursor-pointer hover:opacity-80 disabled:opacity-50 ${statusClass}`}
                aria-haspopup="menu"
                aria-expanded={statusMenuOpen}
              >
                {statusSaving ? 'Saving…' : status}
                <span className="ml-1 text-[10px] opacity-60">▾</span>
              </button>
              {statusMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-full mt-1 z-10 min-w-[140px] rounded-md border border-zinc-200 bg-white shadow-lg overflow-hidden"
                >
                  {STATUS_VALUES.map((s) => {
                    const active = s === status
                    return (
                      <button
                        key={s}
                        type="button"
                        role="menuitem"
                        onClick={() => changeStatus(s)}
                        className={`w-full text-left text-xs px-3 py-1.5 transition ${
                          active
                            ? 'bg-zinc-100 font-semibold text-zinc-900'
                            : 'text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <span
                          className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${
                            (STATUS_COLORS[s] ?? '').split(' ')[0]
                          }`}
                        />
                        {s}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
            {lead.ig_handle ? (
              <span className="text-xs text-zinc-500">@{lead.ig_handle}</span>
            ) : null}
            {lead.website ? (
              <a
                href={lead.website}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                website
              </a>
            ) : null}
          </div>
          {d.outreach_angle ? (
            <p className="text-sm text-zinc-700 mt-2 italic">
              "{d.outreach_angle}"
            </p>
          ) : null}
        </div>
        <div className={`text-right ${scoreColor(score)}`}>
          <div className="text-2xl font-bold tabular-nums">
            {score ?? '—'}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400">
            opportunity
          </div>
        </div>
      </div>

      {d.top_gaps && d.top_gaps.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {d.top_gaps.map((gap, i) => (
            <li key={i} className="text-sm text-zinc-700 flex gap-2">
              <span className="text-zinc-400">•</span>
              <span>{gap}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {expanded ? (
        <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3">
          {/* Structured visual-brand diagnosis dimensions (only if the
              lead's gone through /diagnose-lead). */}
          {(
            [
              ['brand_consistency', 'Brand consistency'],
              ['image_quality', 'Image quality'],
              ['styling_composition', 'Styling & composition'],
              ['visual_hierarchy', 'Visual hierarchy'],
              ['opportunity_for_shaq', 'Opportunity for Shaq'],
            ] as const
          ).map(([key, label]) => {
            const dim = d[key]
            if (!dim) return null
            return (
              <div key={key} className="flex gap-3">
                <div
                  className={`text-sm font-bold tabular-nums w-10 ${scoreColor(dim.score)}`}
                >
                  {dim.score}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-zinc-700">
                    {label}
                  </div>
                  <div className="text-sm text-zinc-600 mt-0.5">{dim.notes}</div>
                </div>
              </div>
            )
          })}

          {/* Seed / discovery fallback — leads that haven't been through
              /diagnose-lead but DO have human-curated notes from the
              import script or Apify-discovery metadata. Renders only when
              the structured dimensions above didn't produce anything. */}
          {!d.brand_consistency &&
          !d.image_quality &&
          !d.styling_composition &&
          !d.visual_hierarchy &&
          !d.opportunity_for_shaq ? (
            <div className="space-y-2">
              {d.why_they_fit ? (
                <div>
                  <div className="text-xs font-semibold text-zinc-700">
                    Why they fit
                  </div>
                  <div className="text-sm text-zinc-700 mt-0.5">
                    {d.why_they_fit}
                  </div>
                </div>
              ) : null}
              {d.human_outreach_angle ? (
                <div>
                  <div className="text-xs font-semibold text-zinc-700">
                    Outreach angle
                  </div>
                  <div className="text-sm text-zinc-700 mt-0.5 italic">
                    "{d.human_outreach_angle}"
                  </div>
                </div>
              ) : null}
              {d.category ? (
                <div>
                  <div className="text-xs font-semibold text-zinc-700">
                    Category
                  </div>
                  <div className="text-sm text-zinc-700 mt-0.5">
                    {d.category}
                  </div>
                </div>
              ) : null}
              {d.source ? (
                <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-100">
                  Source: {d.source}
                </div>
              ) : null}
              {!d.why_they_fit &&
              !d.human_outreach_angle &&
              !d.category &&
              !d.source ? (
                <div className="text-sm text-zinc-500 italic">
                  No diagnosis yet. Paste IG images into the lead form above
                  and re-create to run visual-brand diagnosis, or use
                  "Score against ICP" for a quick verdict.
                </div>
              ) : null}
            </div>
          ) : null}

          {d.red_flags && d.red_flags.length > 0 ? (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3">
              <div className="text-xs font-semibold text-rose-700 mb-1">
                Red flags
              </div>
              <ul className="space-y-0.5">
                {d.red_flags.map((flag, i) => (
                  <li key={i} className="text-sm text-rose-700">
                    • {flag}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              IG DM draft
            </span>
            <button
              type="button"
              onClick={copyDraft}
              className="text-xs px-2 py-1 rounded-md bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <p className="text-sm text-zinc-800 whitespace-pre-wrap">{draft}</p>
        </div>
      ) : null}

      {draftError ? (
        <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {draftError}
        </p>
      ) : null}

      {statusError ? (
        <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Status update failed: {statusError}
        </p>
      ) : null}

      {/* ICP Score panel */}
      {icp ? (
        <div
          className={`mt-4 rounded-lg border p-3 ${ICP_TIER_COLORS[icp.tier]}`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tabular-nums">
                ICP {icp.score}/10
              </span>
              <span className="text-[10px] uppercase tracking-wider">
                {icp.tier.replace('_', ' ')}
              </span>
              <span className="text-[10px] uppercase tracking-wider opacity-70">
                · {icp.suggestedAction.replace(/_/g, ' ')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIcpExpanded((v) => !v)}
              className="text-[11px] underline opacity-80 hover:opacity-100"
            >
              {icpExpanded ? 'hide' : 'details'}
            </button>
          </div>
          {icpExpanded ? (
            <div className="mt-2 space-y-2 text-xs">
              <p className="italic">{icp.rationale}</p>
              {icp.fitReasons.length > 0 ? (
                <div>
                  <span className="font-semibold">Fits:</span>
                  <ul className="list-disc pl-4 mt-0.5">
                    {icp.fitReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {icp.disqualifiers.length > 0 ? (
                <div>
                  <span className="font-semibold">Disqualifiers:</span>
                  <ul className="list-disc pl-4 mt-0.5">
                    {icp.disqualifiers.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="text-[11px] opacity-80 pt-1 border-t border-current/20 space-y-0.5">
                <p>
                  <span className="font-semibold">Size:</span>{' '}
                  {icp.evidenceUsed.sizeSignal}
                </p>
                <p>
                  <span className="font-semibold">Photography:</span>{' '}
                  {icp.evidenceUsed.photographyState}
                </p>
                <p>
                  <span className="font-semibold">Vertical:</span>{' '}
                  {icp.evidenceUsed.icpVerticalMatch}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {scoreError ? (
        <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ICP scoring failed: {scoreError}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          {expanded ? 'Hide full diagnosis' : 'Show full diagnosis'}
        </button>
        <button
          type="button"
          onClick={generateDraft}
          disabled={draftLoading}
          className="text-xs text-blue-600 hover:text-blue-900 transition-colors disabled:text-zinc-300"
        >
          {draftLoading
            ? 'Drafting…'
            : draft
              ? 'Regenerate DM'
              : 'Generate DM draft'}
        </button>
        <button
          type="button"
          onClick={runIcpScore}
          disabled={scoring}
          className="text-xs text-amber-700 hover:text-amber-900 transition-colors disabled:text-zinc-300"
        >
          {scoring ? 'Scoring…' : icp ? 'Re-score ICP' : '🎯 Score against ICP'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIgPanelOpen((v) => !v)
            if (!igHandleInput && lead.ig_handle) {
              setIgHandleInput(lead.ig_handle)
            }
          }}
          disabled={scoring}
          className="text-xs text-purple-700 hover:text-purple-900 transition-colors disabled:text-zinc-300"
        >
          📸 Score with IG
        </button>
      </div>

      {igPanelOpen ? (
        <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 space-y-2">
          <p className="text-xs text-purple-900">
            Pulls the IG profile's 12 recent posts via Apify, then scores
            with vision + cadence. Takes ~30–60s.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-purple-900">@</span>
            <input
              type="text"
              value={igHandleInput}
              onChange={(e) => setIgHandleInput(e.target.value)}
              placeholder={lead.ig_handle ?? 'handle'}
              disabled={scoring}
              className="flex-1 min-w-[180px] rounded-md border border-purple-300 bg-white px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={runIgScore}
              disabled={scoring || !igHandleInput.trim()}
              className="text-xs px-3 py-1 rounded-md bg-purple-700 text-white hover:bg-purple-900 disabled:bg-zinc-300 transition"
            >
              {scoring ? 'Scoring…' : 'Run vision score'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
