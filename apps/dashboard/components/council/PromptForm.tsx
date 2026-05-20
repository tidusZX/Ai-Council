'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'

const EXAMPLE_PROMPTS = [
  'Should I launch a SaaS product for freelance video editors that uses AI to auto-generate rough cuts from raw footage?',
  'I want to rebrand my photography business from wedding-only to lifestyle and commercial work. How should I approach this?',
  "We're considering building our MVP in-house vs hiring an agency. We have 3 months and $50k. What should we do?",
  'Should I post daily on LinkedIn to grow my personal brand or focus on long-form newsletter content?',
]

interface PromptFormProps {
  onSessionCreated?: (sessionId: string) => void
}

export function PromptForm({ onSessionCreated }: PromptFormProps) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || isLoading) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error?.formErrors?.[0] ?? 'Failed to create session')
      }

      const session = await res.json()

      if (onSessionCreated) {
        onSessionCreated(session.id)
      } else {
        router.push(`/sessions/${session.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsLoading(false)
    }
  }

  const charCount = prompt.length
  const maxChars = 4000
  const isOverLimit = charCount > maxChars

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Textarea
        label="Your question, idea, or decision"
        placeholder="Describe your business idea, creative concept, strategic decision, or anything you need expert counsel on..."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={6}
        error={error ?? (isOverLimit ? `${charCount}/${maxChars} characters` : undefined)}
        hint={!isOverLimit ? `${charCount}/${maxChars} characters` : undefined}
        disabled={isLoading}
        className="text-base"
      />

      {/* Example prompts */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          Try an example
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 transition-colors text-left line-clamp-1 max-w-xs"
            >
              {example.slice(0, 60)}...
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          loading={isLoading}
          disabled={!prompt.trim() || isOverLimit}
        >
          {isLoading ? 'Convening council...' : 'Convene the Council'}
        </Button>
      </div>
    </form>
  )
}
