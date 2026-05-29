'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

type Row = {
  ideaId: string
  notionPageId: string
  title: string
  format: 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'
  client: string | null
  hook: string
  draftCaption: string
  postabilityScore: number
}

interface Props {
  initial: Row[]
}

type PushState =
  | { state: 'idle' }
  | { state: 'pushing' }
  | { state: 'done'; message: string }
  | { state: 'error'; message: string }

export function PipelineList({ initial }: Props) {
  const router = useRouter()
  const [pushStates, setPushStates] = useState<Record<string, PushState>>({})

  async function pushRow(pageId: string) {
    setPushStates((prev) => ({ ...prev, [pageId]: { state: 'pushing' } }))
    try {
      const res = await fetch(`/api/posts/${pageId}/push-to-blotato`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      const status = body?.blotato?.status ?? 'submitted'
      const liNote = body?.linkedInSkipped
        ? ` · LinkedIn skipped (video carousel)`
        : body?.linkedIn
          ? ` · LinkedIn scheduled`
          : ''
      setPushStates((prev) => ({
        ...prev,
        [pageId]: { state: 'done', message: `IG: ${status}${liNote}` },
      }))
      router.refresh()
    } catch (e) {
      setPushStates((prev) => ({
        ...prev,
        [pageId]: {
          state: 'error',
          message: e instanceof Error ? e.message : String(e),
        },
      }))
    }
  }

  if (initial.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center">
        <p className="text-sm text-zinc-500">
          Nothing in the pipeline. Run the{' '}
          <a href="/planner" className="underline">
            Planner
          </a>{' '}
          to populate Notion rows with Status="Planned".
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-400">{initial.length} rows ready to push</p>
      {initial.map((row) => {
        const push = pushStates[row.notionPageId] ?? { state: 'idle' as const }
        return (
          <div
            key={row.notionPageId}
            className="rounded-xl border border-zinc-200 bg-white p-5"
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold text-zinc-900">
                    {row.title}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-md border bg-zinc-50 text-zinc-700 border-zinc-200">
                    {row.format}
                  </span>
                  {row.client ? (
                    <span className="text-xs text-zinc-500">{row.client}</span>
                  ) : null}
                </div>
                {row.hook ? (
                  <p className="text-sm text-zinc-700 mt-2 italic">"{row.hook}"</p>
                ) : null}
                <p className="text-sm text-zinc-600 mt-2 whitespace-pre-wrap line-clamp-3">
                  {row.draftCaption}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Button
                  type="button"
                  onClick={() => pushRow(row.notionPageId)}
                  disabled={push.state === 'pushing' || push.state === 'done'}
                >
                  {push.state === 'pushing'
                    ? 'Pushing…'
                    : push.state === 'done'
                      ? '✓ Pushed'
                      : 'Push to Blotato'}
                </Button>
                {push.state === 'done' ? (
                  <p className="text-xs text-emerald-700">{push.message}</p>
                ) : null}
                {push.state === 'error' ? (
                  <p className="text-xs text-red-700 max-w-xs text-right">
                    {push.message}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
