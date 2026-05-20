'use client'

import { cn } from '@/lib/utils'
import { CHAIRPERSON } from '@shaq-os/council-config'
import ReactMarkdown from 'react-markdown'

interface ChairpersonSummaryProps {
  content: string
  isStreaming: boolean
  isComplete: boolean
}

export function ChairpersonSummary({
  content,
  isStreaming,
  isComplete,
}: ChairpersonSummaryProps) {
  const isEmpty = !content && !isStreaming

  return (
    <div
      className={cn(
        'rounded-xl border-2 overflow-hidden transition-all duration-300',
        CHAIRPERSON.borderColor,
        isStreaming && 'shadow-lg shadow-amber-100',
        isEmpty && 'opacity-60'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-3 px-5 py-4',
          CHAIRPERSON.bgColor
        )}
      >
        <span className="text-2xl">{CHAIRPERSON.icon}</span>
        <div>
          <p
            className={cn(
              'font-bold text-base',
              CHAIRPERSON.color
            )}
          >
            {CHAIRPERSON.name}
          </p>
          <p className="text-xs text-zinc-500">{CHAIRPERSON.title}</p>
        </div>
        <div className="ml-auto">
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-bounce [animation-delay:300ms]" />
              </span>
              Synthesizing...
            </span>
          )}
          {isComplete && (
            <span className="text-xs text-green-600 font-medium">
              Council Complete
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5 bg-amber-50/30">
        {isEmpty ? (
          <div className="space-y-2">
            <div className="w-full h-3 bg-amber-100 rounded animate-pulse" />
            <div className="w-3/4 h-3 bg-amber-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="prose prose-sm prose-zinc max-w-none prose-headings:text-amber-800 prose-headings:font-semibold">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && (
              <span className="inline-block w-0.5 h-4 bg-amber-500 animate-pulse ml-0.5 align-text-bottom" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
