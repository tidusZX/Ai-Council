'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

type Idea = {
  title: string
  hook: string
  format: 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'
  draftCaption: string
  rationale: string
}

type Phase = 'idle' | 'generating' | 'preview' | 'approving' | 'done'

const FORMAT_ICON: Record<Idea['format'], string> = {
  CAROUSEL: '🎠',
  SINGLE: '🖼',
  EDUCATIONAL: '🎓',
  'RE-EDIT': '✏️',
}

export function BrainstormWorkflow() {
  const [topic, setTopic] = useState('educational posts about food photography craft')
  const [count, setCount] = useState(7)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [approveResult, setApproveResult] = useState<{
    inserted: number
    errors: string[]
  } | null>(null)

  async function brainstorm() {
    setError(null)
    setIdeas([])
    setChecked(new Set())
    setApproveResult(null)
    setPhase('generating')
    try {
      const res = await fetch('/api/brainstorm/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, count }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ideas) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setIdeas(body.ideas as Idea[])
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  async function approve() {
    if (checked.size === 0) return
    setError(null)
    setPhase('approving')
    try {
      const subset = ideas.filter((_, i) => checked.has(i))
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

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
        <Textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should I brainstorm? e.g. 'hot takes on F&B branding mistakes' or '7 educational posts about lighting'"
          disabled={phase === 'generating' || phase === 'approving'}
          rows={2}
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-zinc-700">
            <span>How many?</span>
            <Input
              type="number"
              min={3}
              max={10}
              value={count}
              onChange={(e) =>
                setCount(Math.min(10, Math.max(3, Number(e.target.value) || 7)))
              }
              disabled={phase === 'generating' || phase === 'approving'}
              className="w-20"
            />
          </div>
          <Button
            type="button"
            onClick={brainstorm}
            disabled={phase === 'generating' || phase === 'approving' || !topic.trim()}
          >
            {phase === 'generating'
              ? 'Brainstorming… (~30s)'
              : phase === 'preview' || phase === 'done'
                ? 'Re-brainstorm'
                : 'Brainstorm'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

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
                    </div>
                    <p className="text-sm text-zinc-700 italic mt-2">"{idea.hook}"</p>
                    <p className="text-sm text-zinc-800 mt-2 whitespace-pre-wrap">
                      {idea.draftCaption}
                    </p>
                    <p className="text-xs text-zinc-500 mt-3">{idea.rationale}</p>
                  </div>
                </div>
              </label>
            )
          })}

          {phase === 'preview' || phase === 'approving' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center justify-between gap-4">
              <p className="text-sm text-emerald-900">
                Approve {checked.size} idea{checked.size === 1 ? '' : 's'} → land in
                Notion as Status="Idea"?
              </p>
              <Button
                type="button"
                onClick={approve}
                disabled={phase === 'approving' || checked.size === 0}
              >
                {phase === 'approving' ? 'Writing to Notion…' : 'Approve selected'}
              </Button>
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
