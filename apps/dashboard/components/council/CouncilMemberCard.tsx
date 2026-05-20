'use client'

import { cn } from '@/lib/utils'
import type { CouncilMemberConfig } from '@shaq-os/council-config'
import ReactMarkdown from 'react-markdown'

interface CouncilMemberCardProps {
  member: CouncilMemberConfig
  content: string
  isStreaming: boolean
  isComplete: boolean
}

export function CouncilMemberCard({
  member,
  content,
  isStreaming,
  isComplete,
}: CouncilMemberCardProps) {
  const isEmpty = !content && !isStreaming

  return (
    <div
      className={cn(
        'rounded-xl border-2 overflow-hidden transition-all duration-300',
        member.borderColor,
        isStreaming && 'shadow-md',
        isEmpty && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className={cn('flex items-center gap-3 px-5 py-4', member.bgColor)}>
        <span className="text-2xl">{member.icon}</span>
        <div>
          <p className={cn('font-semibold text-sm', member.color)}>
            {member.name}
          </p>
          <p className="text-xs text-zinc-500">{member.title}</p>
        </div>
        <div className="ml-auto">
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 rounded-full bg-zinc-400 animate-bounce [animation-delay:300ms]" />
              </span>
              Thinking...
            </span>
          )}
          {isComplete && (
            <span className="text-xs text-green-600 font-medium">Done</span>
          )}
          {isEmpty && (
            <span className="text-xs text-zinc-400">Waiting...</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4 bg-white min-h-[80px]">
        {isEmpty ? (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <div className="w-full h-3 bg-zinc-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="prose prose-sm prose-zinc max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-zinc-400 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
