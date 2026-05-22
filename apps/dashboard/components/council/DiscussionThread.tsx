'use client'

import { useState } from 'react'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'

type DiscussionPayload = {
  type?: string
  question?: string
  response?: string
}

interface Discussion {
  id: string
  payload: unknown
  created_at: string
}

interface Props {
  sessionId: string
  initialDiscussions?: Discussion[]
}

export function DiscussionThread({ sessionId, initialDiscussions = [] }: Props) {
  const [discussions, setDiscussions] = useState<Discussion[]>(initialDiscussions)
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/sessions/${sessionId}/discuss`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.discussion) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setDiscussions((prev) => [...prev, body.discussion as Discussion])
      setQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-t border-zinc-200 pt-6">
        <h3 className="text-sm font-semibold text-zinc-900 mb-1">
          Continue the discussion
        </h3>
        <p className="text-xs text-zinc-500">
          The Chairperson will respond, drawing on the full session — push back,
          ask for clarification, or test the conclusion against new info.
        </p>
      </div>

      {discussions.length > 0 ? (
        <div className="space-y-4">
          {discussions.map((d) => {
            const p = (d.payload as DiscussionPayload | null) ?? {}
            if (p.type !== 'discussion') return null
            return (
              <div key={d.id} className="space-y-2">
                <div className="rounded-xl bg-zinc-100 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                    You asked
                  </p>
                  <p className="text-sm text-zinc-900 whitespace-pre-wrap">
                    {p.question}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-amber-700 mb-1">
                    Chairperson
                  </p>
                  <div className="text-sm text-zinc-900 whitespace-pre-wrap prose prose-sm max-w-none">
                    {p.response}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            discussions.length === 0
              ? 'e.g. "Critic, your concern about over-rotation — does the same risk apply if I lead with the BTS post first?"'
              : 'Ask a follow-up…'
          }
          disabled={submitting}
          rows={3}
        />
        <div className="flex justify-between items-center">
          <p className="text-xs text-zinc-400">
            The Chairperson sees the full prior session + all earlier follow-ups.
          </p>
          <Button type="submit" disabled={submitting || !question.trim()}>
            {submitting ? 'Thinking…' : 'Ask'}
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
