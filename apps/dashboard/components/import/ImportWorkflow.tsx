'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

type Format = 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'
type Status = 'Idea' | 'Planned' | 'Scheduled' | 'Published'

type Item = {
  title: string
  format: Format
  draftCaption: string
  status: Status
  client: string
  hook: string
  hashtags: string
  scheduledDate: string
  imageUrl: string
}

function blankItem(): Item {
  return {
    title: '',
    format: 'CAROUSEL',
    draftCaption: '',
    status: 'Planned',
    client: '',
    hook: '',
    hashtags: '',
    scheduledDate: '',
    imageUrl: '',
  }
}

export function ImportWorkflow() {
  const [items, setItems] = useState<Item[]>([blankItem()])
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    inserted: number
    errors: string[]
  } | null>(null)

  function update(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, k) => (k === i ? { ...it, ...patch } : it)))
  }
  function addRow() {
    setItems((prev) => [...prev, blankItem()])
  }
  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, k) => k !== i))
  }

  async function submit() {
    setError(null)
    setResult(null)
    const payload = items
      .filter((it) => it.title.trim() && it.draftCaption.trim())
      .map((it) => ({
        title: it.title.trim(),
        format: it.format,
        draftCaption: it.draftCaption.trim(),
        status: it.status,
        client: it.client.trim() || undefined,
        hook: it.hook.trim() || undefined,
        hashtags: it.hashtags
          .split(/[,\n]/)
          .map((h) => h.trim().replace(/^#/, ''))
          .filter(Boolean),
        scheduledDate: it.scheduledDate || undefined,
        imageUrl: it.imageUrl.trim() || undefined,
      }))
      .map((it) => ({
        ...it,
        hashtags: it.hashtags.length ? it.hashtags : undefined,
      }))

    if (payload.length === 0) {
      setError('At least one item needs a title and draft caption.')
      return
    }

    setPhase('submitting')
    try {
      const res = await fetch('/api/import-existing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setResult(body as { inserted: number; errors: string[] })
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  const isBusy = phase === 'submitting'

  return (
    <div className="space-y-4">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Item {i + 1}</h3>
            {items.length > 1 ? (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-xs text-zinc-500 hover:text-red-600"
              >
                Remove
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs text-zinc-600">Title</span>
              <Input
                value={it.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="Prosperity Pals — McDonald's"
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">Client</span>
              <Input
                value={it.client}
                onChange={(e) => update(i, { client: e.target.value })}
                placeholder="McDonald's Singapore"
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">Format</span>
              <select
                value={it.format}
                onChange={(e) =>
                  update(i, { format: e.target.value as Format })
                }
                disabled={isBusy}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="CAROUSEL">🎠 Carousel</option>
                <option value="SINGLE">🖼 Single</option>
                <option value="EDUCATIONAL">🎓 Educational</option>
                <option value="RE-EDIT">✏️ Re-edit</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">Status</span>
              <select
                value={it.status}
                onChange={(e) =>
                  update(i, { status: e.target.value as Status })
                }
                disabled={isBusy}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="Planned">Planned (planner will skip)</option>
                <option value="Idea">Idea (planner can pick it)</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Published">Published</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">Scheduled date</span>
              <Input
                type="date"
                value={it.scheduledDate}
                onChange={(e) => update(i, { scheduledDate: e.target.value })}
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">
                Image / Drive URL <span className="text-zinc-400">(optional)</span>
              </span>
              <Input
                value={it.imageUrl}
                onChange={(e) => update(i, { imageUrl: e.target.value })}
                placeholder="https://drive.google.com/…"
                disabled={isBusy}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs text-zinc-600">Hook (optional)</span>
            <Input
              value={it.hook}
              onChange={(e) => update(i, { hook: e.target.value })}
              placeholder="The brief said celebration. That's all I needed."
              disabled={isBusy}
            />
          </label>

          <label className="block">
            <span className="text-xs text-zinc-600">Draft caption</span>
            <Textarea
              value={it.draftCaption}
              onChange={(e) => update(i, { draftCaption: e.target.value })}
              rows={4}
              placeholder="Paste the final caption you want in Notion."
              disabled={isBusy}
            />
          </label>

          <label className="block">
            <span className="text-xs text-zinc-600">
              Hashtags{' '}
              <span className="text-zinc-400">(comma- or line-separated)</span>
            </span>
            <Textarea
              value={it.hashtags}
              onChange={(e) => update(i, { hashtags: e.target.value })}
              rows={2}
              placeholder="sgfood, mcdonalds, brandcampaign"
              disabled={isBusy}
            />
          </label>
        </div>
      ))}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={addRow}
          className="text-sm text-zinc-600 hover:text-zinc-900 underline"
          disabled={isBusy}
        >
          + Add another item
        </button>
        <Button
          type="button"
          onClick={submit}
          disabled={isBusy || items.every((it) => !it.title.trim())}
        >
          {isBusy ? 'Importing…' : `Import ${items.length} to Notion`}
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-5">
          <p className="text-sm font-semibold text-emerald-900">
            ✅ {result.inserted} item{result.inserted === 1 ? '' : 's'} imported
            to Notion
          </p>
          {result.errors.length ? (
            <ul className="text-xs text-emerald-900 mt-2 space-y-1">
              {result.errors.map((err, i) => (
                <li key={i}>• {err}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-emerald-800 mt-2">
            Open your Notion Content DB and filter by Shoot = "Imported" or check
            the calendar view. Drag a cover JPG into the Image property if you
            want previews to show in calendar cards.
          </p>
        </div>
      ) : null}
    </div>
  )
}
