'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

type Mode = 'ig_handles' | 'maps_category'

interface SkippedEntry {
  ig_handle: string
  reason: string
  detail?: string
}

interface PollResponse {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'partial'
  apifyRunId?: string
  newLeads?: {
    id: string
    business_name: string
    ig_handle: string
    icpScore?: number
  }[]
  skipped?: SkippedEntry[]
  errorMessage?: string
  costUsd?: number
}

const POPULAR_CATEGORIES = [
  'specialty coffee shop',
  'fine dining restaurant',
  'café',
  'cocktail bar',
  'fashion boutique',
  'skincare brand',
  'florist',
  'bakery',
]

export function DiscoverWorkflow() {
  const [mode, setMode] = useState<Mode>('ig_handles')

  // ig_handles state
  const [handlesText, setHandlesText] = useState('')
  const [postsPerHandle, setPostsPerHandle] = useState(12)

  // maps_category state
  const [category, setCategory] = useState('specialty coffee shop')
  const [location, setLocation] = useState('Singapore')
  const [minReviews, setMinReviews] = useState(50)
  const [maxResults, setMaxResults] = useState(20)
  const [minIcpScore, setMinIcpScore] = useState(6)

  const [phase, setPhase] = useState<'idle' | 'triggering' | 'polling' | 'done'>(
    'idle'
  )
  const [error, setError] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [pollResult, setPollResult] = useState<PollResponse | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  function parseHandles(): string[] {
    return handlesText
      .split(/[\n,\s]+/)
      .map((s) => s.trim().replace(/^@/, '').toLowerCase())
      .filter((s) => s.length > 0)
  }
  const handles = parseHandles()
  const handlesOver = handles.length > 30

  async function startDiscovery() {
    setError(null)
    setPollResult(null)
    setRunId(null)

    if (mode === 'ig_handles') {
      if (handles.length === 0) {
        setError('Paste at least one Instagram handle.')
        return
      }
      if (handlesOver) {
        setError(`${handles.length} handles — cap is 30 per run.`)
        return
      }
    } else {
      if (category.trim().length < 3) {
        setError('Category must be at least 3 characters.')
        return
      }
    }

    setPhase('triggering')
    try {
      const body =
        mode === 'ig_handles'
          ? {
              mode: 'ig_handles',
              igHandles: handles,
              postsPerHandle,
            }
          : {
              mode: 'maps_category',
              category: category.trim(),
              location: location.trim() || 'Singapore',
              minReviews,
              maxResults,
              minIcpScore,
            }
      const res = await fetch('/api/leads/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const respBody = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(respBody?.message || respBody?.error || `Status ${res.status}`)
      }
      setRunId(respBody.runId)
      setPhase('polling')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  useEffect(() => {
    if (phase !== 'polling' || !runId) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/leads/discover/${runId}`)
        const body = (await res.json().catch(() => null)) as PollResponse | null
        if (cancelled) return
        if (!res.ok || !body) {
          throw new Error(`Poll failed: ${res.status}`)
        }
        setPollResult(body)
        if (
          body.status === 'succeeded' ||
          body.status === 'failed' ||
          body.status === 'partial'
        ) {
          setPhase('done')
          if (pollTimer.current) clearInterval(pollTimer.current)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      }
    }

    poll()
    pollTimer.current = setInterval(poll, 5000)
    return () => {
      cancelled = true
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [phase, runId])

  const isBusy = phase === 'triggering' || phase === 'polling'

  return (
    <div className="space-y-6">
      {/* MODE TOGGLE */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500 mr-1">Mode:</span>
          {(
            [
              ['ig_handles', '🧷', 'IG Handles', 'paste handles you already know'],
              ['maps_category', '🗺️', 'Maps Category', 'find SG businesses by category + ICP-score'],
            ] as const
          ).map(([m, icon, label, hint]) => {
            const on = mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  if (!isBusy) {
                    setMode(m)
                    setError(null)
                    setPollResult(null)
                  }
                }}
                disabled={isBusy}
                className={`text-sm px-3 py-1.5 rounded-md border transition ${
                  on
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500'
                }`}
                title={hint}
              >
                {icon} {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* INPUT — ig_handles */}
      {mode === 'ig_handles' ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <Textarea
            value={handlesText}
            onChange={(e) => setHandlesText(e.target.value)}
            rows={6}
            disabled={isBusy}
            placeholder={
              'Paste Instagram handles, one per line. Max 30.\nStrip the @ or keep it.\n\nExample:\nfatherssg\nthemomentcollectivesg\nbutterstudio.sg'
            }
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-zinc-700">
                <span>Posts per handle:</span>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={postsPerHandle}
                  onChange={(e) =>
                    setPostsPerHandle(
                      Math.min(24, Math.max(1, Number(e.target.value) || 12))
                    )
                  }
                  disabled={isBusy}
                  className="w-20"
                />
              </div>
              <span className="text-xs text-zinc-500">
                {handles.length} handle{handles.length === 1 ? '' : 's'} parsed
                {handlesOver ? ' (over 30 cap)' : ''}
              </span>
            </div>
            <Button
              type="button"
              onClick={startDiscovery}
              disabled={isBusy || handles.length === 0 || handlesOver}
            >
              {phase === 'triggering'
                ? 'Triggering Apify…'
                : phase === 'polling'
                  ? 'Polling…'
                  : 'Discover'}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            Bulk-add IG profiles. Each handle gets its latest 12 post images
            stored in <code>discovery_metadata</code>. No auto-scoring — runs
            the existing dedup against your funnel.
          </p>
        </div>
      ) : null}

      {/* INPUT — maps_category */}
      {mode === 'maps_category' ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs text-zinc-600">Category</span>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. specialty coffee shop"
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">Location</span>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Singapore"
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">
                Min Google reviews{' '}
                <span className="text-zinc-400">(filter out tiny shops)</span>
              </span>
              <Input
                type="number"
                min={0}
                max={10000}
                value={minReviews}
                onChange={(e) =>
                  setMinReviews(Math.max(0, Number(e.target.value) || 0))
                }
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">
                Max results{' '}
                <span className="text-zinc-400">(cap Apify cost)</span>
              </span>
              <Input
                type="number"
                min={1}
                max={50}
                value={maxResults}
                onChange={(e) =>
                  setMaxResults(
                    Math.min(50, Math.max(1, Number(e.target.value) || 20))
                  )
                }
                disabled={isBusy}
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs text-zinc-600">
                Min ICP score{' '}
                <span className="text-zinc-400">
                  (1–10 — only leads scoring ≥ this land in your funnel)
                </span>
              </span>
              <Input
                type="number"
                min={1}
                max={10}
                value={minIcpScore}
                onChange={(e) =>
                  setMinIcpScore(
                    Math.min(10, Math.max(1, Number(e.target.value) || 6))
                  )
                }
                disabled={isBusy}
              />
            </label>
          </div>

          {/* Popular category chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-500">Try:</span>
            {POPULAR_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                disabled={isBusy}
                className="text-xs px-2 py-1 rounded-md border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-500"
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={startDiscovery}
              disabled={isBusy || category.trim().length < 3}
            >
              {phase === 'triggering'
                ? 'Triggering Apify…'
                : phase === 'polling'
                  ? 'Polling…'
                  : 'Discover'}
            </Button>
          </div>

          <p className="text-xs text-zinc-500">
            Apify Google Maps finds SG businesses matching this category.
            Pre-filters by reviews + website + chain denylist, then ICP-scores
            each survivor. Only score ≥ {minIcpScore} lands in <a href="/leads" className="underline">/leads</a>.
            Estimated ${((maxResults * 0.005) + (maxResults * 0.012)).toFixed(2)} per run (Apify + scorer).
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {phase === 'polling' && pollResult ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          🔄 Apify run <strong>{pollResult.apifyRunId?.slice(0, 8)}…</strong>{' '}
          status = {pollResult.status}. Refreshing every 5s.
        </div>
      ) : null}

      {phase === 'done' && pollResult ? (
        <div className="space-y-3">
          {pollResult.newLeads && pollResult.newLeads.length > 0 ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
              <p className="text-sm font-semibold text-emerald-900">
                ✅ {pollResult.newLeads.length} new lead
                {pollResult.newLeads.length === 1 ? '' : 's'} added
                {pollResult.status === 'partial'
                  ? ` (${(pollResult.skipped ?? []).length} skipped — see below)`
                  : ''}
              </p>
              <ul className="mt-3 space-y-1">
                {pollResult.newLeads.map((l) => (
                  <li key={l.id} className="text-sm text-emerald-900">
                    •{' '}
                    {typeof l.icpScore === 'number' ? (
                      <span className="text-xs font-mono mr-1 px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300">
                        ICP {l.icpScore}/10
                      </span>
                    ) : null}
                    <strong>{l.business_name}</strong>
                    {l.ig_handle ? ` · @${l.ig_handle}` : ''}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-emerald-800 mt-3">
                View on <a href="/leads" className="underline">/leads</a>.
              </p>
            </div>
          ) : pollResult.status === 'succeeded' ? (
            <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-5">
              <p className="text-sm font-semibold text-zinc-700">
                Run complete · 0 new leads
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                {mode === 'maps_category'
                  ? 'Everything was filtered out (chain, low reviews, or below ICP threshold). Try a different category or lower the ICP threshold.'
                  : 'All handles were already in your funnel — dedup did its job.'}
              </p>
            </div>
          ) : null}

          {pollResult.status === 'failed' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-700">Run failed</p>
              {pollResult.errorMessage ? (
                <p className="text-xs text-red-700 mt-2">{pollResult.errorMessage}</p>
              ) : null}
            </div>
          ) : null}

          {pollResult.skipped && pollResult.skipped.length > 0 ? (
            <details className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
              <summary className="text-sm font-semibold text-zinc-700 cursor-pointer">
                Skipped {pollResult.skipped.length} (click to expand)
              </summary>
              <ul className="mt-2 text-xs text-zinc-600 space-y-0.5">
                {pollResult.skipped.map((s, i) => (
                  <li key={i}>
                    • {s.ig_handle} — <em>{s.reason}</em>
                    {s.detail ? `: ${s.detail}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
