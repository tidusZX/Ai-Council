'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

interface SkippedEntry {
  ig_handle: string
  reason: 'already_exists' | 'no_posts' | 'private' | 'insert_failed'
  detail?: string
}

interface PollResponse {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'partial'
  apifyRunId?: string
  newLeads?: { id: string; business_name: string; ig_handle: string }[]
  skipped?: SkippedEntry[]
  errorMessage?: string
  costUsd?: number
}

export function DiscoverWorkflow() {
  const [handlesText, setHandlesText] = useState('')
  const [postsPerHandle, setPostsPerHandle] = useState(12)

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
  const tooMany = handles.length > 30

  async function startDiscovery() {
    if (handles.length === 0) {
      setError('Paste at least one Instagram handle.')
      return
    }
    if (tooMany) {
      setError(`${handles.length} handles — cap is 30 per run. Trim the list.`)
      return
    }
    setError(null)
    setPollResult(null)
    setRunId(null)
    setPhase('triggering')
    try {
      const res = await fetch('/api/leads/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode: 'ig_handles',
          igHandles: handles,
          postsPerHandle,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setRunId(body.runId)
      setPhase('polling')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  // Polling loop while in the 'polling' phase.
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

    // First poll immediately, then every 5s.
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
      {/* INPUT */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <Textarea
          value={handlesText}
          onChange={(e) => setHandlesText(e.target.value)}
          rows={6}
          disabled={isBusy}
          placeholder={
            'Paste Instagram handles, one per line. Max 30.\nStrip the @ or keep it — both work.\n\nExample:\npscafe\n@tiongbahrubakery\nopenfarmcommunity\nfossachocolate'
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
              {tooMany ? ' (over 30 cap)' : ''}
            </span>
          </div>
          <Button
            type="button"
            onClick={startDiscovery}
            disabled={isBusy || handles.length === 0 || tooMany}
          >
            {phase === 'triggering'
              ? 'Triggering Apify…'
              : phase === 'polling'
                ? 'Polling…'
                : 'Discover'}
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          Estimated cost ≈ ${(handles.length * 0.005).toFixed(2)} Apify (free
          tier covers it). Each handle takes 5–15s to scrape. Results land
          here when the Apify Actor finishes; you'll see the new leads below.
        </p>
      </div>

      {/* ERROR */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {/* POLL STATUS */}
      {phase === 'polling' && pollResult ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          🔄 Apify run <strong>{pollResult.apifyRunId?.slice(0, 8)}…</strong>{' '}
          status = {pollResult.status}. Refreshing every 5s.
        </div>
      ) : null}

      {/* RESULT */}
      {phase === 'done' && pollResult ? (
        <div className="space-y-3">
          {pollResult.newLeads && pollResult.newLeads.length > 0 ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
              <p className="text-sm font-semibold text-emerald-900">
                ✅ {pollResult.newLeads.length} new lead
                {pollResult.newLeads.length === 1 ? '' : 's'} added to your
                funnel
                {pollResult.status === 'partial'
                  ? ` (${(pollResult.skipped ?? []).length} skipped — see below)`
                  : ''}
              </p>
              <ul className="mt-3 space-y-1">
                {pollResult.newLeads.map((l) => (
                  <li key={l.id} className="text-sm text-emerald-900">
                    • <strong>{l.business_name}</strong> · @{l.ig_handle}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-emerald-800 mt-3">
                Visit <a href="/leads" className="underline">/leads</a> to see
                them and trigger diagnoses (each lead has 12 recent post images
                stored in discovery_metadata.latest_post_image_urls).
              </p>
            </div>
          ) : pollResult.status === 'succeeded' ? (
            // Happy-path-with-no-new — all handles were dedup matches.
            <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-5">
              <p className="text-sm font-semibold text-zinc-700">
                Run complete · 0 new leads
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                {(pollResult.skipped ?? []).every(
                  (s) => s.reason === 'already_exists'
                )
                  ? 'All handles were already in your funnel — dedup did its job. Try a different set to add new ones.'
                  : 'Apify ran, but no new leads landed. See the skipped panel below for reasons.'}
              </p>
            </div>
          ) : null}

          {pollResult.status === 'failed' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-700">
                Run failed
              </p>
              {pollResult.errorMessage ? (
                <p className="text-xs text-red-700 mt-2">
                  {pollResult.errorMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          {pollResult.skipped && pollResult.skipped.length > 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
              <p className="text-sm font-semibold text-zinc-700">
                Skipped {pollResult.skipped.length} (already in funnel, no
                posts, or insert errors)
              </p>
              <ul className="mt-2 text-xs text-zinc-600 space-y-0.5">
                {pollResult.skipped.map((s, i) => (
                  <li key={i}>
                    • @{s.ig_handle} — <em>{s.reason}</em>
                    {s.detail ? `: ${s.detail}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
