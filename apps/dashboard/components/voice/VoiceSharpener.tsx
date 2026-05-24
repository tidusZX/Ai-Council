'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

type Format = 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'

interface SharpenResult {
  sharpenedCaption: string
  angle: string
  changesSummary: string[]
  bannedWordsRemoved: string[]
  ctaUsed: string
  confidence: number
  flags: string[]
  hashtags: string[]
  fullPost: string | null
}

type Status = 'Idea' | 'Planned' | 'Scheduled' | 'Published'

export function VoiceSharpener() {
  const [draftCaption, setDraftCaption] = useState('')
  const [title, setTitle] = useState('')
  const [client, setClient] = useState('')
  const [hook, setHook] = useState('')
  const [format, setFormat] = useState<Format>('SINGLE')
  const [includeHashtags, setIncludeHashtags] = useState(true)
  const [includeFullPost, setIncludeFullPost] = useState(true)

  const [phase, setPhase] = useState<'idle' | 'sharpening'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SharpenResult | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Send to Notion state.
  const [notionPanelOpen, setNotionPanelOpen] = useState(false)
  const [notionTitle, setNotionTitle] = useState('')
  const [notionStatus, setNotionStatus] = useState<Status>('Planned')
  const [notionScheduledDate, setNotionScheduledDate] = useState('')
  const [notionImageUrl, setNotionImageUrl] = useState('')
  const [notionPhase, setNotionPhase] = useState<'idle' | 'sending' | 'done'>(
    'idle'
  )
  const [notionError, setNotionError] = useState<string | null>(null)
  const [notionPageId, setNotionPageId] = useState<string | null>(null)

  async function sharpen() {
    if (!draftCaption.trim() || draftCaption.trim().length < 5) {
      setError('Draft caption must be at least 5 characters.')
      return
    }
    setError(null)
    setResult(null)
    setNotionPanelOpen(false)
    setNotionPhase('idle')
    setNotionError(null)
    setNotionPageId(null)
    setPhase('sharpening')
    try {
      const res = await fetch('/api/voice/sharpen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draftCaption: draftCaption.trim(),
          title: title.trim() || undefined,
          client: client.trim() || undefined,
          hook: hook.trim() || undefined,
          format,
          includeHashtags,
          includeFullPost,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setResult(body as SharpenResult)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  async function sendToNotion() {
    if (!result) return
    const finalTitle = (notionTitle.trim() || title.trim()).slice(0, 200)
    if (!finalTitle || finalTitle.length < 3) {
      setNotionError('Title needs at least 3 characters.')
      return
    }
    setNotionError(null)
    setNotionPhase('sending')
    try {
      const captionToSend = result.fullPost ?? result.sharpenedCaption
      const res = await fetch('/api/import-existing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              title: finalTitle,
              format,
              draftCaption: captionToSend,
              status: notionStatus,
              client: client.trim() || undefined,
              hook: hook.trim() || undefined,
              hashtags: result.hashtags.length
                ? result.hashtags.map((h) => h.replace(/^#/, ''))
                : undefined,
              scheduledDate: notionScheduledDate || undefined,
              imageUrl: notionImageUrl.trim() || undefined,
              shootName: client.trim() || undefined,
            },
          ],
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      const inserted = (body?.items ?? [])[0]
      setNotionPageId(inserted?.notionPageId ?? null)
      setNotionPhase('done')
    } catch (e) {
      setNotionError(e instanceof Error ? e.message : String(e))
      setNotionPhase('idle')
    }
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500)
    } catch {
      // clipboard blocked
    }
  }

  const isBusy = phase === 'sharpening'

  return (
    <div className="space-y-6">
      {/* INPUT */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
        <Textarea
          value={draftCaption}
          onChange={(e) => setDraftCaption(e.target.value)}
          rows={6}
          disabled={isBusy}
          placeholder="Paste your caption draft here. Anything from a one-liner to a 400-word post."
        />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs text-zinc-600">
              Title <span className="text-zinc-400">(optional)</span>
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Prosperity Pals — McDonald's"
              disabled={isBusy}
            />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-600">
              Client <span className="text-zinc-400">(optional)</span>
            </span>
            <Input
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="e.g. McDonald's Singapore"
              disabled={isBusy}
            />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-600">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
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
            <span className="text-xs text-zinc-600">
              Hook <span className="text-zinc-400">(optional)</span>
            </span>
            <Input
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              placeholder="The first line you have in mind"
              disabled={isBusy}
            />
          </label>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={includeHashtags}
              onChange={(e) => setIncludeHashtags(e.target.checked)}
              disabled={isBusy}
              className="accent-amber-600"
            />
            Generate hashtags
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={includeFullPost}
              onChange={(e) => setIncludeFullPost(e.target.checked)}
              disabled={isBusy}
              className="accent-amber-600"
            />
            Compose full post (caption + hashtags ready to paste)
          </label>
          <Button
            type="button"
            onClick={sharpen}
            disabled={isBusy || draftCaption.trim().length < 5}
            className="ml-auto bg-amber-600 hover:bg-amber-700"
          >
            {isBusy ? 'Sharpening…' : '🔥 Sharpen with Ember'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {/* RESULT */}
      {result ? (
        <div className="space-y-4">
          {/* Diff: original vs sharpened */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Your draft
              </h3>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                {draftCaption}
              </p>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  🔥 Ember sharpened · {result.confidence}/3
                </h3>
                <button
                  type="button"
                  onClick={() => copyText('caption', result.sharpenedCaption)}
                  className="text-xs px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  {copied === 'caption' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-zinc-900 whitespace-pre-wrap">
                {result.sharpenedCaption}
              </p>
            </div>
          </div>

          {/* Angle + metadata */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
            <div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Angle:
              </span>{' '}
              <span className="text-sm text-zinc-900">{result.angle}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                CTA:
              </span>{' '}
              <span className="text-sm font-mono text-zinc-900">
                {result.ctaUsed}
              </span>
            </div>
            {result.changesSummary.length > 0 ? (
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">
                  Changes:
                </span>
                <ul className="text-sm text-zinc-700 list-disc pl-5 mt-1 space-y-0.5">
                  {result.changesSummary.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result.bannedWordsRemoved.length > 0 ? (
              <p className="text-xs text-amber-800">
                Banned words removed: {result.bannedWordsRemoved.join(', ')}
              </p>
            ) : null}
            {result.flags.length > 0 ? (
              <p className="text-xs text-red-700">
                ⚠ Flags: {result.flags.join('; ')}
              </p>
            ) : null}
          </div>

          {/* Hashtags */}
          {result.hashtags.length > 0 ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">
                  Hashtags ({result.hashtags.length})
                </h3>
                <button
                  type="button"
                  onClick={() => copyText('tags', result.hashtags.join(' '))}
                  className="text-xs px-2 py-1 rounded-md bg-white border border-indigo-300 text-indigo-800 hover:bg-indigo-100"
                >
                  {copied === 'tags' ? 'Copied ✓' : 'Copy all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.hashtags.map((h) => (
                  <span
                    key={h}
                    className="text-xs px-2 py-1 rounded-md bg-white border border-indigo-200 text-indigo-900 font-mono"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Full post — copy-paste ready */}
          {result.fullPost ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                  Full post (paste this into Instagram)
                </h3>
                <button
                  type="button"
                  onClick={() => copyText('post', result.fullPost ?? '')}
                  className="text-xs px-2 py-1 rounded-md bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                >
                  {copied === 'post' ? 'Copied ✓' : 'Copy post'}
                </button>
              </div>
              <p className="text-sm text-zinc-900 whitespace-pre-wrap font-mono">
                {result.fullPost}
              </p>
            </div>
          ) : null}

          {/* Send to Notion → Pipeline → Blotato */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <button
              type="button"
              onClick={() => {
                setNotionPanelOpen((v) => !v)
                if (!notionTitle.trim() && title.trim()) {
                  setNotionTitle(title.trim())
                }
              }}
              disabled={notionPhase === 'done'}
              className="text-sm font-semibold text-zinc-900 hover:text-zinc-700 transition"
            >
              {notionPhase === 'done'
                ? '✅ Sent to Notion'
                : notionPanelOpen
                  ? '− Send to Notion (closes the loop)'
                  : '+ Send to Notion → Pipeline → Blotato'}
            </button>

            {notionPhase === 'done' && notionPageId ? (
              <p className="text-xs text-emerald-700 mt-2">
                Created in Notion · row will appear on{' '}
                <a
                  href="/scheduled-pipeline"
                  className="underline hover:text-emerald-900"
                >
                  /scheduled-pipeline
                </a>{' '}
                ready for Blotato push.{' '}
                <a
                  href={`https://www.notion.so/${notionPageId.replace(/-/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-emerald-900"
                >
                  Open in Notion
                </a>
              </p>
            ) : null}

            {notionPanelOpen && notionPhase !== 'done' ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-zinc-600">
                      Title (required)
                    </span>
                    <Input
                      value={notionTitle}
                      onChange={(e) => setNotionTitle(e.target.value)}
                      placeholder={title || 'e.g. McDonalds Prosperity Pals'}
                      disabled={notionPhase === 'sending'}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-600">Status</span>
                    <select
                      value={notionStatus}
                      onChange={(e) => setNotionStatus(e.target.value as Status)}
                      disabled={notionPhase === 'sending'}
                      className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="Planned">Planned (skips planner)</option>
                      <option value="Idea">Idea (planner can pick it)</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Published">Published</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-600">
                      Scheduled date{' '}
                      <span className="text-zinc-400">(optional)</span>
                    </span>
                    <Input
                      type="date"
                      value={notionScheduledDate}
                      onChange={(e) => setNotionScheduledDate(e.target.value)}
                      disabled={notionPhase === 'sending'}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-600">
                      Drive link / image URL{' '}
                      <span className="text-zinc-400">(optional)</span>
                    </span>
                    <Input
                      value={notionImageUrl}
                      onChange={(e) => setNotionImageUrl(e.target.value)}
                      placeholder="https://drive.google.com/…"
                      disabled={notionPhase === 'sending'}
                    />
                  </label>
                </div>

                <div className="text-xs text-zinc-500">
                  Notion row gets: title + format ({format}) + this status +
                  sharpened caption{result.fullPost ? ' (with hashtags inline)' : ''}
                  {result.hashtags.length
                    ? ` + ${result.hashtags.length} hashtags`
                    : ''}
                  {client.trim() ? ` + client "${client.trim()}"` : ''}.
                  {' '}From there, push to Blotato when ready.
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={sendToNotion}
                    disabled={notionPhase === 'sending'}
                  >
                    {notionPhase === 'sending' ? 'Sending…' : 'Send to Notion'}
                  </Button>
                </div>

                {notionError ? (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    {notionError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
