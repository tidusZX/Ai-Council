'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

type Format = 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'

type Idea = {
  title: string
  hook: string
  format: Format
  draftCaption: string
  rationale: string
  sharpened?: {
    sharpenedCaption: string
    angle: string
    changesSummary: string[]
    bannedWordsRemoved: string[]
    ctaUsed: string
    confidence: number
    flags: string[]
  }
  useSharpened?: boolean
}

type Angle = {
  id: string
  topic: string
  painPointId: string
  format: Format
  oneLineHook: string
  why: string
}
type PainPoint = { id: string; headline: string; evidence: string; severity: number }
type KnowledgeGap = { id: string; headline: string; whyItMatters: string }
type DecisionPattern = { id: string; observation: string; implicationForContent: string }
type AudienceSignal = {
  summary: string
  painPoints: PainPoint[]
  knowledgeGaps: KnowledgeGap[]
  decisionPatterns: DecisionPattern[]
  angles: Angle[]
  topPicks: string[]
}

type Lens = 'brainstorm' | 'audience'
type Phase =
  | 'idle'
  | 'generating'
  | 'preview'
  | 'sharpening'
  | 'approving'
  | 'done'

const FORMAT_ICON: Record<Format, string> = {
  CAROUSEL: '🎠',
  SINGLE: '🖼',
  EDUCATIONAL: '🎓',
  'RE-EDIT': '✏️',
}

const SEVERITY_LABEL = ['', 'low', 'medium', 'high']

export function BrainstormWorkflow() {
  const [lens, setLens] = useState<Lens>('brainstorm')
  const [topic, setTopic] = useState(
    'educational posts about food photography craft'
  )
  const [count, setCount] = useState(7)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [signal, setSignal] = useState<AudienceSignal | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [approveResult, setApproveResult] = useState<{
    inserted: number
    errors: string[]
  } | null>(null)

  function resetForRun() {
    setError(null)
    setIdeas([])
    setSignal(null)
    setChecked(new Set())
    setApproveResult(null)
  }

  async function run() {
    resetForRun()
    setPhase('generating')
    try {
      const endpoint =
        lens === 'audience' ? '/api/audience-signal/run' : '/api/brainstorm/run'
      const payload =
        lens === 'audience' ? { topic } : { topic, count }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      if (lens === 'audience') {
        setSignal(body as AudienceSignal)
      } else {
        setIdeas(body.ideas as Idea[])
      }
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  function sendAngleToBrainstorm(a: Angle) {
    setLens('brainstorm')
    setTopic(a.topic)
    setSignal(null)
    setIdeas([])
    setChecked(new Set())
    setApproveResult(null)
    setError(null)
    setPhase('idle')
  }

  async function sharpenSelected() {
    if (checked.size === 0) return
    setError(null)
    setPhase('sharpening')
    try {
      const indexes = Array.from(checked)
      const results = await Promise.all(
        indexes.map(async (i) => {
          const idea = ideas[i]
          const res = await fetch('/api/voice/sharpen', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              draftCaption: idea.draftCaption,
              title: idea.title,
              hook: idea.hook,
              format: idea.format,
            }),
          })
          const body = await res.json().catch(() => null)
          if (!res.ok) {
            throw new Error(
              body?.message || body?.error || `Sharpen failed (${res.status})`
            )
          }
          return [i, body as Idea['sharpened']] as const
        })
      )
      setIdeas((prev) => {
        const next = [...prev]
        for (const [i, sharpened] of results) {
          if (sharpened) next[i] = { ...next[i], sharpened, useSharpened: true }
        }
        return next
      })
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('preview')
    }
  }

  async function approve() {
    if (checked.size === 0) return
    setError(null)
    setPhase('approving')
    try {
      const subset = ideas
        .filter((_, i) => checked.has(i))
        .map((idea) => ({
          title: idea.title,
          hook: idea.hook,
          format: idea.format,
          draftCaption:
            idea.useSharpened && idea.sharpened
              ? idea.sharpened.sharpenedCaption
              : idea.draftCaption,
          rationale: idea.rationale,
        }))
      const res = await fetch('/api/brainstorm/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, ideas: subset }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setApproveResult(body as { inserted: number; errors: string[] })
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('preview')
    }
  }

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleSharpenedFor(i: number) {
    setIdeas((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], useSharpened: !next[i].useSharpened }
      return next
    })
  }

  const isBusy =
    phase === 'generating' || phase === 'sharpening' || phase === 'approving'

  const placeholder =
    lens === 'audience'
      ? "What audience to research? e.g. 'Mid-sized SG F&B brands considering rebrand'"
      : "What should I brainstorm? e.g. 'hot takes on F&B branding mistakes'"

  const runLabel = (() => {
    if (phase === 'generating')
      return lens === 'audience'
        ? 'Researching… (~30s)'
        : 'Brainstorming… (~30s)'
    if (phase === 'preview' || phase === 'done') return 'Re-run'
    return lens === 'audience' ? 'Run audience signal' : 'Brainstorm'
  })()

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-zinc-700 flex items-center gap-2">
            Lens:
            <select
              value={lens}
              onChange={(e) => {
                const v = e.target.value as Lens
                setLens(v)
                resetForRun()
                setPhase('idle')
              }}
              disabled={isBusy}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
            >
              <option value="brainstorm">Brainstorm (ideas)</option>
              <option value="audience">Audience Signal (market researcher)</option>
            </select>
          </label>
          {lens === 'audience' ? (
            <span className="text-xs text-zinc-500">
              Step 1 of the content loop — find pain points, then send the best
              angles to Brainstorm.
            </span>
          ) : null}
        </div>

        <Textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={placeholder}
          disabled={isBusy}
          rows={2}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {lens === 'brainstorm' ? (
            <div className="flex items-center gap-2 text-sm text-zinc-700">
              <span>How many?</span>
              <Input
                type="number"
                min={3}
                max={10}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.min(10, Math.max(3, Number(e.target.value) || 7))
                  )
                }
                disabled={isBusy}
                className="w-20"
              />
            </div>
          ) : (
            <div />
          )}
          <Button
            type="button"
            onClick={run}
            disabled={isBusy || !topic.trim()}
          >
            {runLabel}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {/* AUDIENCE SIGNAL OUTPUT */}
      {signal ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
            <h3 className="text-sm font-semibold text-indigo-900">Summary</h3>
            <p className="text-sm text-indigo-900 mt-1">{signal.summary}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Pain points</h3>
              <ul className="mt-3 space-y-2">
                {signal.painPoints.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-zinc-100 bg-zinc-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        {p.headline}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {SEVERITY_LABEL[p.severity] ?? p.severity}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1">{p.evidence}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Knowledge gaps
              </h3>
              <ul className="mt-3 space-y-2">
                {signal.knowledgeGaps.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-md border border-zinc-100 bg-zinc-50 p-3"
                  >
                    <p className="text-sm font-medium text-zinc-900">
                      {g.headline}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">{g.whyItMatters}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-zinc-900">
              Decision patterns
            </h3>
            <ul className="mt-3 space-y-2">
              {signal.decisionPatterns.map((d) => (
                <li
                  key={d.id}
                  className="rounded-md border border-zinc-100 bg-zinc-50 p-3"
                >
                  <p className="text-sm text-zinc-900">{d.observation}</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    → {d.implicationForContent}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">
                {signal.angles.length} brainstormable angles
              </h3>
              <span className="text-xs text-zinc-500">
                Top picks are highlighted — click "Send to Brainstorm" to
                generate ideas from any angle.
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {signal.angles.map((a) => {
                const isTop = signal.topPicks.includes(a.id)
                return (
                  <li
                    key={a.id}
                    className={`rounded-md border p-3 flex items-start justify-between gap-3 ${
                      isTop
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-zinc-100 bg-zinc-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-200 bg-white text-zinc-700">
                          {FORMAT_ICON[a.format]} {a.format}
                        </span>
                        {isTop ? (
                          <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                            top pick
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium text-zinc-900 mt-2">
                        {a.topic}
                      </p>
                      <p className="text-xs italic text-zinc-600 mt-1">
                        "{a.oneLineHook}"
                      </p>
                      <p className="text-xs text-zinc-500 mt-2">{a.why}</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => sendAngleToBrainstorm(a)}
                      className="shrink-0"
                    >
                      Send to Brainstorm →
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {/* BRAINSTORM OUTPUT */}
      {ideas.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              {ideas.length} ideas · {checked.size} selected
            </h3>
            <button
              type="button"
              onClick={() =>
                setChecked(
                  checked.size === ideas.length
                    ? new Set()
                    : new Set(ideas.map((_, i) => i))
                )
              }
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              {checked.size === ideas.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {ideas.map((idea, i) => {
            const isChecked = checked.has(i)
            const showingSharpened = !!(idea.useSharpened && idea.sharpened)
            return (
              <label
                key={i}
                className={`block rounded-xl border p-5 cursor-pointer transition-colors ${
                  isChecked
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(i)}
                    className="mt-1 w-4 h-4 accent-emerald-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
                        {FORMAT_ICON[idea.format]} {idea.format}
                      </span>
                      <h4 className="text-base font-semibold text-zinc-900">
                        {idea.title}
                      </h4>
                      {idea.sharpened ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            toggleSharpenedFor(i)
                          }}
                          className={`ml-auto text-[11px] px-2 py-0.5 rounded-md border ${
                            showingSharpened
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-zinc-200 bg-white text-zinc-600'
                          }`}
                        >
                          {showingSharpened ? '🔥 Ember' : 'Original'}
                        </button>
                      ) : null}
                    </div>
                    <p className="text-sm text-zinc-700 italic mt-2">
                      "{idea.hook}"
                    </p>
                    <p className="text-sm text-zinc-800 mt-2 whitespace-pre-wrap">
                      {showingSharpened
                        ? idea.sharpened!.sharpenedCaption
                        : idea.draftCaption}
                    </p>
                    {showingSharpened && idea.sharpened ? (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-900">
                          Ember pass — confidence {idea.sharpened.confidence}/3 ·
                          CTA: {idea.sharpened.ctaUsed}
                        </p>
                        <p className="text-xs text-amber-900 mt-1">
                          {idea.sharpened.angle}
                        </p>
                        {idea.sharpened.changesSummary.length ? (
                          <ul className="text-xs text-amber-900 mt-2 list-disc pl-4 space-y-0.5">
                            {idea.sharpened.changesSummary.map((c, k) => (
                              <li key={k}>{c}</li>
                            ))}
                          </ul>
                        ) : null}
                        {idea.sharpened.bannedWordsRemoved.length ? (
                          <p className="text-[11px] text-amber-800 mt-2">
                            Banned words removed:{' '}
                            {idea.sharpened.bannedWordsRemoved.join(', ')}
                          </p>
                        ) : null}
                        {idea.sharpened.flags.length ? (
                          <p className="text-[11px] text-red-700 mt-2">
                            Flags: {idea.sharpened.flags.join('; ')}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="text-xs text-zinc-500 mt-3">{idea.rationale}</p>
                  </div>
                </div>
              </label>
            )
          })}

          {phase === 'preview' ||
          phase === 'sharpening' ||
          phase === 'approving' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-emerald-900">
                {checked.size} selected — sharpen with Ember first, or approve
                straight to Notion.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={sharpenSelected}
                  disabled={isBusy || checked.size === 0}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {phase === 'sharpening'
                    ? 'Sharpening…'
                    : '🔥 Sharpen with Ember'}
                </Button>
                <Button
                  type="button"
                  onClick={approve}
                  disabled={isBusy || checked.size === 0}
                >
                  {phase === 'approving'
                    ? 'Writing to Notion…'
                    : 'Approve selected'}
                </Button>
              </div>
            </div>
          ) : null}

          {approveResult ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-5">
              <p className="text-sm font-semibold text-emerald-900">
                ✅ {approveResult.inserted} idea
                {approveResult.inserted === 1 ? '' : 's'} added to Notion
              </p>
              {approveResult.errors.length ? (
                <ul className="text-xs text-emerald-900 mt-2 space-y-1">
                  {approveResult.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              ) : null}
              <p className="text-xs text-emerald-800 mt-2">
                Filter your Notion DB by Status="Idea" + Shoot contains
                "Brainstorm:" to see them. Drop them onto dates in the Calendar
                view, or feed them into the next Planner run.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
