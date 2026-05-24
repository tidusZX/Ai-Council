'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

type Format = 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'

interface CritiqueCandidate {
  ideaId: string
  notionPageId: string
  title: string
  format: Format
  client: string | null
  shootName: string | null
  hook: string
  draftCaption: string
  postabilityScore: number
  imageUrl: string | null
  primaryImageId: string | null
}

const FORMAT_ICON: Record<Format, string> = {
  CAROUSEL: '🎠',
  SINGLE: '🖼',
  EDUCATIONAL: '🎓',
  'RE-EDIT': '✏️',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-700'
  if (score >= 60) return 'text-amber-700'
  if (score >= 40) return 'text-orange-700'
  return 'text-rose-700'
}

function buildPrompt(c: CritiqueCandidate): string {
  const parts: string[] = [
    'Critique this content idea for @getarchivedsg before I post it.',
    '',
    `TITLE: ${c.title}`,
    `FORMAT: ${c.format}`,
  ]
  if (c.client) parts.push(`CLIENT: ${c.client}`)
  if (c.shootName) parts.push(`SHOOT: ${c.shootName}`)
  parts.push(`POSTABILITY (PQ heuristic): ${c.postabilityScore}/100`)
  if (c.hook) parts.push(`HOOK: ${c.hook}`)
  parts.push('')
  parts.push('DRAFT CAPTION:')
  parts.push(c.draftCaption || '(no caption yet)')
  parts.push('')
  parts.push(
    'I want to know: does this earn a slot in my monthly 10? Strongest angle? Weakest link? What would each of you change before it ships?'
  )
  return parts.join('\n')
}

export function CritiqueWorkflow() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<CritiqueCandidate[]>([])
  const [phase, setPhase] = useState<'loading' | 'idle' | 'creating'>('loading')
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formatFilter, setFormatFilter] = useState<'ALL' | Format>('ALL')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch('/api/critique/candidates')
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(body?.message || body?.error || `Status ${res.status}`)
        }
        if (alive) {
          setCandidates(body.candidates as CritiqueCandidate[])
          setPhase('idle')
        }
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e))
          setPhase('idle')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  async function critique(c: CritiqueCandidate) {
    setError(null)
    setPhase('creating')
    setCreatingId(c.ideaId)
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: buildPrompt(c),
          title: `Critique: ${c.title}`,
          imageUrls: c.imageUrl ? [c.imageUrl] : undefined,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.error?.formErrors?.[0] || body?.error || `Status ${res.status}`)
      }
      router.push(`/sessions/${body.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
      setCreatingId(null)
    }
  }

  const filtered =
    formatFilter === 'ALL'
      ? candidates
      : candidates.filter((c) => c.format === formatFilter)

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-zinc-600">Filter:</span>
        {(['ALL', 'CAROUSEL', 'SINGLE', 'EDUCATIONAL', 'RE-EDIT'] as const).map(
          (f) => {
            const on = formatFilter === f
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFormatFilter(f)}
                className={`text-xs px-3 py-1 rounded-md border transition ${
                  on
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500'
                }`}
              >
                {f === 'ALL' ? 'All' : `${FORMAT_ICON[f]} ${f}`}
              </button>
            )
          }
        )}
        <span className="text-xs text-zinc-400 ml-auto">
          {filtered.length} of {candidates.length} ideas
        </span>
      </div>

      {phase === 'loading' ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Loading Notion ideas…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {phase !== 'loading' && filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No Notion ideas matching this filter. Run the Photo Qualifier
          (<code className="text-zinc-700 bg-zinc-100 px-1 rounded">
            npm run full
          </code>
          ) to populate the backlog.
        </div>
      ) : null}

      {filtered.map((c) => {
        const isCreating = creatingId === c.ideaId
        return (
          <div
            key={c.ideaId}
            className="rounded-xl border border-zinc-200 bg-white p-5 flex gap-4"
          >
            {/* Thumbnail */}
            <div className="shrink-0">
              {c.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={c.imageUrl}
                  alt={c.title}
                  className="w-32 h-32 object-cover rounded-md border border-zinc-200"
                />
              ) : (
                <div className="w-32 h-32 rounded-md border border-zinc-200 bg-zinc-50 flex items-center justify-center text-2xl">
                  {FORMAT_ICON[c.format]}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
                      {FORMAT_ICON[c.format]} {c.format}
                    </span>
                    {c.client ? (
                      <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600">
                        {c.client}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="text-base font-semibold text-zinc-900 mt-2">
                    {c.title}
                  </h3>
                  {c.hook ? (
                    <p className="text-sm italic text-zinc-600 mt-1">"{c.hook}"</p>
                  ) : null}
                  {c.draftCaption ? (
                    <p className="text-sm text-zinc-700 mt-2 line-clamp-3">
                      {c.draftCaption}
                    </p>
                  ) : null}
                </div>
                <div className={`text-right shrink-0 ${scoreColor(c.postabilityScore)}`}>
                  <div className="text-2xl font-bold tabular-nums">
                    {c.postabilityScore}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                    postability
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                <Button
                  type="button"
                  onClick={() => critique(c)}
                  disabled={phase === 'creating'}
                >
                  {isCreating ? 'Convening council…' : '💬 Critique with Council'}
                </Button>
                {!c.imageUrl ? (
                  <span className="text-xs text-zinc-500">
                    No image — council critiques text-only.
                  </span>
                ) : null}
                <a
                  href={`https://www.notion.so/${c.notionPageId.replace(/-/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-zinc-500 hover:text-zinc-900 underline ml-auto"
                >
                  Open in Notion
                </a>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
