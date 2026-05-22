'use client'

import { useState } from 'react'
import type { Lead } from '@shaq-os/database-types'

type ScoreNote = { score: number; notes: string }
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
  const [draft, setDraft] = useState<string | null>(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const d = (lead.diagnosis as Diagnosis | null) ?? {}
  const score = lead.opportunity_score
  const statusClass = STATUS_COLORS[lead.status] ?? STATUS_COLORS.new

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
            <span
              className={`text-xs px-2 py-0.5 rounded-md border ${statusClass}`}
            >
              {lead.status}
            </span>
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

      <div className="mt-3 flex items-center gap-3">
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
      </div>
    </div>
  )
}
