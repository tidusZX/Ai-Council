'use client'

import Link from 'next/link'
import { cn, formatRelativeTime, truncate } from '@/lib/utils'
import type { Session, SessionStatus } from '@shaq-os/database-types'

const STATUS_CONFIG: Record<SessionStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-zinc-100 text-zinc-600' },
  processing: { label: 'Processing', className: 'bg-blue-100 text-blue-700' },
  complete: { label: 'Complete', className: 'bg-green-100 text-green-700' },
  error: { label: 'Error', className: 'bg-red-100 text-red-700' },
}

interface SessionCardProps {
  session: Session
}

export function SessionCard({ session }: SessionCardProps) {
  const statusConfig =
    STATUS_CONFIG[session.status as SessionStatus] ?? STATUS_CONFIG.pending

  return (
    <Link href={`/sessions/${session.id}`}>
      <div className="group rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 hover:shadow-sm transition-all duration-200">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-zinc-900 text-sm leading-snug group-hover:text-zinc-700 transition-colors line-clamp-2">
              {session.title}
            </h3>
            <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">
              {truncate(session.prompt, 120)}
            </p>
          </div>
          <span
            className={cn(
              'shrink-0 text-xs font-medium px-2 py-1 rounded-full',
              statusConfig.className
            )}
          >
            {statusConfig.label}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-zinc-400">
            {formatRelativeTime(session.created_at)}
          </span>
        </div>
      </div>
    </Link>
  )
}
