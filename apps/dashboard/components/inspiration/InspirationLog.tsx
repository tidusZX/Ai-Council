'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const KEYFRAME_BUCKET = 'video-keyframes'

function keyframeUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${SUPABASE_URL}/storage/v1/object/public/${KEYFRAME_BUCKET}/${path}`
}

type AnalysisShape = {
  hook?: string
  structure?: string
  pacing?: string
  shot_list?: { shot_n: number; description: string; est_duration_s?: number }[]
  captions_used?: string
  music_and_audio?: string
  hypothesized_why_it_works?: string[]
  risks_if_replicated?: string[]
}

type InspirationEntry = {
  id: string
  url: string
  platform: string | null
  creator_handle: string | null
  video_title: string | null
  source: string
  status: 'processing' | 'complete' | 'failed'
  summary: string | null
  analysis: AnalysisShape | null
  keyframe_urls: string[]
  error_message: string | null
  created_at: string
}

const PLATFORM_ICON: Record<string, string> = {
  instagram: '📸',
  tiktok: '🎵',
  youtube: '▶️',
  other: '🎬',
}

interface Props {
  initial: InspirationEntry[]
}

export function InspirationLog({ initial }: Props) {
  const [entries, setEntries] = useState<InspirationEntry[]>(initial)
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [clientName, setClientName] = useState('')
  const [deckSubmitting, setDeckSubmitting] = useState(false)
  const [deckError, setDeckError] = useState<string | null>(null)

  const selectedCount = selected.size
  const canBuildDeck = clientName.trim().length >= 2 && selectedCount >= 1

  function toggleSelected(entryId: string) {
    setDeckError(null)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
    setDeckError(null)
  }

  async function handleBuildDeck(ev: React.FormEvent) {
    ev.preventDefault()
    if (!canBuildDeck) return

    setDeckError(null)
    setDeckSubmitting(true)
    try {
      const res = await fetch('/api/inspiration/deck', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entry_ids: Array.from(selected),
          client_name: clientName.trim(),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Error ${res.status}`)
      }
      if (!body?.design_url) {
        throw new Error('Deck response did not include a design URL')
      }
      window.open(body.design_url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setDeckError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeckSubmitting(false)
    }
  }

  // Poll for processing entries every 10s
  const pollProcessing = useCallback(async () => {
    const processing = entries.filter((e) => e.status === 'processing')
    if (processing.length === 0) return

    const updated = await Promise.all(
      processing.map(async (e) => {
        try {
          const res = await fetch(`/api/inspiration/${e.id}`)
          if (!res.ok) return e
          return (await res.json()) as InspirationEntry
        } catch {
          return e
        }
      })
    )

    setEntries((prev) =>
      prev.map((e) => updated.find((u) => u.id === e.id) ?? e)
    )
  }, [entries])

  useEffect(() => {
    const hasProcessing = entries.some((e) => e.status === 'processing')
    if (!hasProcessing) return
    const timer = setInterval(pollProcessing, 10_000)
    return () => clearInterval(timer)
  }, [entries, pollProcessing])

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/inspiration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, source: 'dashboard' }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Error ${res.status}`)
      }
      // Optimistically add the new entry as processing
      const newEntry: InspirationEntry = {
        id: body.id,
        url,
        platform: null,
        creator_handle: null,
        video_title: null,
        source: 'dashboard',
        status: 'processing',
        summary: null,
        analysis: null,
        keyframe_urls: [],
        error_message: null,
        created_at: new Date().toISOString(),
      }
      setEntries((prev) => [newEntry, ...prev])
      setUrl('')
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Submit form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a TikTok, Instagram Reel, or YouTube Short URL"
              required
              disabled={submitting}
              className="flex-1"
            />
            <Button type="submit" disabled={submitting || !url}>
              {submitting ? 'Saving…' : 'Analyze'}
            </Button>
          </div>
          {submitError ? (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {submitError}
            </p>
          ) : null}
          <p className="text-xs text-zinc-400">
            Or send any reel link to your Telegram bot — it&apos;ll log it here
            automatically.
          </p>
        </form>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center">
          <p className="text-sm text-zinc-500">
            No entries yet. Paste a URL above or send a reel to the Telegram
            bot.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <InspirationCard
              key={entry.id}
              entry={entry}
              isSelected={selected.has(entry.id)}
              isExpanded={expanded === entry.id}
              onSelect={() => toggleSelected(entry.id)}
              onToggle={() =>
                setExpanded(expanded === entry.id ? null : entry.id)
              }
            />
          ))}
        </div>
      )}

      {selectedCount >= 1 ? (
        <div className="fixed inset-x-0 bottom-4 z-30 px-4">
          <form
            onSubmit={handleBuildDeck}
            className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg shadow-zinc-900/10 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <div className="shrink-0 text-sm font-medium text-zinc-900">
              {selectedCount} selected
            </div>
            <div className="min-w-48 flex-1">
              <Input
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value)
                  setDeckError(null)
                }}
                placeholder="Client name…"
                disabled={deckSubmitting}
                className="rounded-xl"
              />
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="submit"
                disabled={!canBuildDeck}
                loading={deckSubmitting}
                className="rounded-xl"
              >
                {deckSubmitting ? 'Building…' : 'Build deck'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={clearSelection}
                disabled={deckSubmitting}
                className="rounded-xl"
              >
                Clear
              </Button>
            </div>
            {deckError ? (
              <p className="text-sm text-red-700 sm:basis-full">
                {deckError}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  )
}

function InspirationCard({
  entry,
  isSelected,
  isExpanded,
  onSelect,
  onToggle,
}: {
  entry: InspirationEntry
  isSelected: boolean
  isExpanded: boolean
  onSelect: () => void
  onToggle: () => void
}) {
  const icon = PLATFORM_ICON[entry.platform ?? 'other'] ?? '🎬'
  const analysis = entry.analysis
  const isSelectable = entry.status === 'complete'

  return (
    <div className="relative rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {isSelectable ? (
        <label className="absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white shadow-sm">
          <span className="sr-only">Select inspiration entry</span>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 accent-zinc-900"
          />
        </label>
      ) : null}
      {/* Header */}
      <div
        className={`flex items-start gap-3 p-5 ${
          isSelectable ? 'pl-12' : ''
        }`}
      >
        {/* Keyframes strip */}
        {entry.keyframe_urls.length > 0 ? (
          <div className="flex gap-1 shrink-0">
            {entry.keyframe_urls.slice(0, 3).map((kf, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={keyframeUrl(kf)}
                alt={`frame ${i + 1}`}
                className="w-16 h-16 object-cover rounded-md border border-zinc-100"
              />
            ))}
          </div>
        ) : entry.status === 'processing' ? (
          <div className="w-16 h-16 rounded-md bg-zinc-100 animate-pulse shrink-0" />
        ) : null}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{icon}</span>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-zinc-900 hover:underline truncate max-w-xs"
            >
              {entry.video_title ||
                entry.creator_handle ||
                new URL(entry.url).hostname.replace(/^www\./, '')}
            </a>
            <StatusBadge status={entry.status} />
            <span className="text-xs text-zinc-400 ml-auto">
              {entry.source === 'telegram' ? '📱 Telegram' : '🖥 Dashboard'} ·{' '}
              {new Date(entry.created_at).toLocaleDateString('en-SG', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          </div>

          {entry.status === 'processing' ? (
            <p className="text-sm text-zinc-400 mt-2 animate-pulse">
              Analyzing… this takes 30-90 seconds
            </p>
          ) : entry.status === 'failed' ? (
            <p className="text-sm text-red-600 mt-2">
              {entry.error_message ?? 'Analysis failed'}
            </p>
          ) : entry.summary ? (
            <p className="text-sm text-zinc-600 mt-2 whitespace-pre-line line-clamp-3">
              {entry.summary}
            </p>
          ) : null}
        </div>

        {analysis ? (
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-zinc-400 hover:text-zinc-700 shrink-0 transition"
          >
            {isExpanded ? '▲ Less' : '▼ Full analysis'}
          </button>
        ) : null}
      </div>

      {/* Expanded full analysis */}
      {isExpanded && analysis ? (
        <div className="border-t border-zinc-100 px-5 pb-5 pt-4 space-y-4">
          {analysis.hook ? (
            <Section title="Hook" content={analysis.hook} />
          ) : null}
          {analysis.structure ? (
            <Section title="Structure" content={analysis.structure} />
          ) : null}
          {analysis.pacing ? (
            <Section title="Pacing" content={analysis.pacing} />
          ) : null}
          {analysis.hypothesized_why_it_works?.length ? (
            <BulletSection
              title="Why it works"
              items={analysis.hypothesized_why_it_works}
              color="text-emerald-700"
            />
          ) : null}
          {analysis.risks_if_replicated?.length ? (
            <BulletSection
              title="Risks if replicated"
              items={analysis.risks_if_replicated}
              color="text-amber-700"
            />
          ) : null}
          {analysis.captions_used ? (
            <Section title="Captions" content={analysis.captions_used} />
          ) : null}
          {analysis.music_and_audio ? (
            <Section
              title="Music & audio"
              content={analysis.music_and_audio}
            />
          ) : null}
          {analysis.shot_list?.length ? (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Shot list
              </p>
              <ol className="space-y-1">
                {analysis.shot_list.map((shot) => (
                  <li key={shot.shot_n} className="text-sm text-zinc-700 flex gap-2">
                    <span className="text-zinc-400 w-5 shrink-0">
                      {shot.shot_n}.
                    </span>
                    <span>
                      {shot.description}
                      {shot.est_duration_s ? (
                        <span className="text-zinc-400 ml-1">
                          (~{shot.est_duration_s}s)
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }: { status: InspirationEntry['status'] }) {
  if (status === 'processing')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
        Processing
      </span>
    )
  if (status === 'failed')
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        Failed
      </span>
    )
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      ✓ Saved
    </span>
  )
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
        {title}
      </p>
      <p className="text-sm text-zinc-700">{content}</p>
    </div>
  )
}

function BulletSection({
  title,
  items,
  color,
}: {
  title: string
  items: string[]
  color: string
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
        {title}
      </p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className={`text-sm ${color} flex gap-2`}>
            <span>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
