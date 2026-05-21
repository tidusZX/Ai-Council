'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function AnalyzeForm() {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/video-jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        const msg =
          body?.message ||
          body?.error ||
          `Request failed with status ${res.status}`
        throw new Error(msg)
      }
      setUrl('')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
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
          {submitting ? 'Submitting…' : 'Analyze'}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-zinc-400">
        Pipeline: download → 12 keyframes → Whisper transcript → Claude
        analysis. Typically 30–90 seconds. Cap: 5 minutes per video.
      </p>
    </form>
  )
}
