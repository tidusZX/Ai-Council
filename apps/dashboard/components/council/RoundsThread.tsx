'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { COUNCIL_MEMBERS, CHAIRPERSON } from '@shaq-os/council-config'
import type { Message } from '@shaq-os/database-types'

const ALL_MEMBERS = COUNCIL_MEMBERS.map((m) => m.role)
const ALL_ROLES = [...ALL_MEMBERS, 'chairperson' as const] as const
type Role = (typeof ALL_ROLES)[number]

function memberIcon(role: string): string {
  if (role === 'chairperson') return CHAIRPERSON.icon
  return COUNCIL_MEMBERS.find((m) => m.role === role)?.icon ?? '•'
}
function memberName(role: string): string {
  if (role === 'chairperson') return CHAIRPERSON.name
  return COUNCIL_MEMBERS.find((m) => m.role === role)?.name ?? role
}

interface Props {
  sessionId: string
  allMessages: Message[]
}

interface Round {
  number: number
  messages: Message[]
}

function groupByRound(messages: Message[]): Round[] {
  const map = new Map<number, Message[]>()
  for (const m of messages) {
    const r = m.round_number ?? 1
    const list = map.get(r) ?? []
    list.push(m)
    map.set(r, list)
  }
  const rounds: Round[] = [...map.entries()]
    .map(([number, msgs]) => ({
      number,
      messages: msgs.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    }))
    .sort((a, b) => a.number - b.number)
  return rounds
}

export function RoundsThread({ sessionId, allMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(allMessages)
  const [question, setQuestion] = useState('')
  const [addressed, setAddressed] = useState<Set<Role>>(new Set(ALL_ROLES))
  const [phase, setPhase] = useState<'idle' | 'submitting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const rounds = groupByRound(messages)
  const followUpRounds = rounds.filter((r) => r.number >= 2)

  function toggleRole(role: Role) {
    setAddressed((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  function selectAll() {
    setAddressed(new Set(ALL_ROLES))
  }
  function selectNone() {
    setAddressed(new Set())
  }
  function toggleCollapse(n: number) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  async function submit() {
    if (!question.trim() || addressed.size === 0) return
    setError(null)
    setPhase('submitting')
    try {
      const res = await fetch('/api/council/followup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question: question.trim(),
          addressedTo: Array.from(addressed),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }

      // Fetch the new round's messages to render in place.
      const refetched = await fetch(`/api/sessions/${sessionId}`)
      if (refetched.ok) {
        const data = await refetched.json().catch(() => null)
        if (data?.messages) {
          setMessages(data.messages as Message[])
        }
      }
      setQuestion('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="space-y-6 border-t border-zinc-200 pt-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">
          Address the council
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          Re-engage specific members for a fresh round. Each follow-up creates
          a new round with full prior context.
        </p>
      </div>

      {/* Rendered follow-up rounds */}
      {followUpRounds.length > 0 ? (
        <div className="space-y-4">
          {followUpRounds.map((round) => {
            const isCollapsed = collapsed.has(round.number)
            const targetTags =
              round.messages[0]?.addressed_to &&
              round.messages[0].addressed_to.length > 0 &&
              round.messages[0].addressed_to.length < ALL_ROLES.length
                ? ` · @${round.messages[0].addressed_to.join(', @')}`
                : ''
            return (
              <div
                key={round.number}
                className="rounded-xl border border-zinc-200 bg-white overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleCollapse(round.number)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-50 transition"
                >
                  <span className="text-sm font-semibold text-zinc-900">
                    Round {round.number} · {round.messages.length} response
                    {round.messages.length === 1 ? '' : 's'}
                    {targetTags}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {isCollapsed ? 'show' : 'hide'}
                  </span>
                </button>
                {!isCollapsed ? (
                  <div className="px-4 py-4 space-y-4 border-t border-zinc-100">
                    {round.messages.map((m) => (
                      <div key={m.id}>
                        <div className="text-xs font-medium text-zinc-600 mb-1">
                          {memberIcon(m.role)} {memberName(m.role)}
                        </div>
                        <div className="text-sm text-zinc-900 whitespace-pre-wrap leading-relaxed">
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Follow-up input */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500">Address:</span>
          {ALL_ROLES.map((role) => {
            const on = addressed.has(role)
            return (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                disabled={phase === 'submitting'}
                className={`text-xs px-2 py-1 rounded-md border transition ${
                  on
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500'
                }`}
              >
                {memberIcon(role)} {memberName(role).replace('The ', '')}
              </button>
            )
          })}
          <button
            type="button"
            onClick={addressed.size === ALL_ROLES.length ? selectNone : selectAll}
            disabled={phase === 'submitting'}
            className="text-xs text-zinc-500 hover:text-zinc-900 underline ml-auto"
          >
            {addressed.size === ALL_ROLES.length ? 'clear' : 'all'}
          </button>
        </div>

        <Textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          disabled={phase === 'submitting'}
          placeholder={
            followUpRounds.length === 0
              ? 'e.g. "Critic, sharpen your concern about the Carta angle. Strategist, what would change your verdict?"'
              : 'Ask a follow-up…'
          }
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-zinc-400">
            Each member sees the original prompt + every prior round.
          </p>
          <Button
            type="button"
            onClick={submit}
            disabled={
              phase === 'submitting' || !question.trim() || addressed.size === 0
            }
          >
            {phase === 'submitting'
              ? 'Running round…'
              : `Run round (${addressed.size} ${addressed.size === 1 ? 'member' : 'members'})`}
          </Button>
        </div>

        {error ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
