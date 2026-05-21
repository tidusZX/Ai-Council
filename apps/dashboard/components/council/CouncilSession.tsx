'use client'

import { useEffect, useRef, useState } from 'react'
import { COUNCIL_MEMBERS, CHAIRPERSON } from '@shaq-os/council-config'
import { CouncilMemberCard } from './CouncilMemberCard'
import { ChairpersonSummary } from './ChairpersonSummary'
import type { Message, Session } from '@shaq-os/database-types'

interface CouncilSessionProps {
  session: Session
  initialMessages?: Message[]
}

type MemberState = {
  content: string
  isStreaming: boolean
  isComplete: boolean
}

const ROLES = COUNCIL_MEMBERS.map((m) => m.role)

export function CouncilSession({ session, initialMessages = [] }: CouncilSessionProps) {
  const [memberStates, setMemberStates] = useState<Record<string, MemberState>>(() => {
    const initial: Record<string, MemberState> = {}
    const allRoles = [...ROLES, 'chairperson' as const]

    for (const role of allRoles) {
      const existing = initialMessages.find((m) => m.role === role)
      initial[role] = {
        content: existing?.content ?? '',
        isStreaming: false,
        isComplete: existing?.is_complete ?? false,
      }
    }
    return initial
  })

  const currentRoleIndex = useRef(0)
  const streamedContents = useRef<Record<string, string>>({})
  const [hasStarted, setHasStarted] = useState(false)
  const [isComplete, setIsComplete] = useState(session.status === 'complete')

  async function streamRole(role: string, context?: string) {
    setMemberStates((prev) => ({
      ...prev,
      [role]: { content: prev[role]?.content ?? '', isStreaming: true, isComplete: false },
    }))

    const res = await fetch('/api/council', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id, role, context }),
    })

    if (!res.ok || !res.body) {
      setMemberStates((prev) => ({
        ...prev,
        [role]: { content: 'Error generating response.', isStreaming: false, isComplete: false },
      }))
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      accumulated += chunk
      setMemberStates((prev) => ({
        ...prev,
        [role]: { content: accumulated, isStreaming: true, isComplete: false },
      }))
    }

    streamedContents.current[role] = accumulated

    setMemberStates((prev) => ({
      ...prev,
      [role]: { content: accumulated, isStreaming: false, isComplete: true },
    }))
  }

  async function runCouncil() {
    setHasStarted(true)

    // Stream each council member sequentially
    for (const role of ROLES) {
      await streamRole(role)
    }

    // Build context for chairperson from all member responses
    const context = COUNCIL_MEMBERS.map((m) => {
      const content = streamedContents.current[m.role] ?? memberStates[m.role]?.content
      return `### ${m.name}\n${content}`
    }).join('\n\n')

    await streamRole('chairperson', context)
    setIsComplete(true)
  }

  // Auto-start if session is new (no messages yet)
  useEffect(() => {
    const hasExistingContent = initialMessages.some((m) => m.content)
    if (!hasExistingContent && !hasStarted && session.status !== 'complete') {
      runCouncil()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chairState = memberStates['chairperson']

  return (
    <div className="space-y-6">
      {/* Session header */}
      <div className="rounded-xl bg-zinc-900 text-white px-6 py-5">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
          Council Session
        </p>
        <p className="text-base leading-relaxed">{session.prompt}</p>
      </div>

      {/* Council members grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {COUNCIL_MEMBERS.map((member) => {
          const state = memberStates[member.role]
          return (
            <CouncilMemberCard
              key={member.role}
              member={member}
              content={state?.content ?? ''}
              isStreaming={state?.isStreaming ?? false}
              isComplete={state?.isComplete ?? false}
            />
          )
        })}
      </div>

      {/* Chairperson synthesis */}
      <ChairpersonSummary
        content={chairState?.content ?? ''}
        isStreaming={chairState?.isStreaming ?? false}
        isComplete={chairState?.isComplete ?? false}
      />
    </div>
  )
}
