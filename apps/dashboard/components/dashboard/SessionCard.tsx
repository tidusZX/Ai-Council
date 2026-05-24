'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
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
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusConfig =
    STATUS_CONFIG[session.status as SessionStatus] ?? STATUS_CONFIG.pending

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (deleting) return
    const ok = window.confirm(
      `Delete "${session.title}"? This removes the session and all its messages. Can't be undone.`
    )
    if (!ok) return
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/sessions/${session.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `Status ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  return (
    <Link href={`/sessions/${session.id}`}>
      <div className="group rounded-xl border border-zinc-200 bg-white p-5 hover:border-zinc-400 hover:shadow-sm transition-all duration-200 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-zinc-900 text-sm leading-snug group-hover:text-zinc-700 transition-colors line-clamp-2">
              {session.title}
            </h3>
            <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">
              {truncate(session.prompt, 120)}
            </p>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <span
              className={cn(
                'text-xs font-medium px-2 py-1 rounded-full',
                statusConfig.className
              )}
            >
              {statusConfig.label}
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete session"
              title="Delete session"
              className={cn(
                'text-xs text-zinc-400 hover:text-red-600 hover:bg-red-50',
                'rounded-md p-1 transition-colors',
                'opacity-0 group-hover:opacity-100 focus:opacity-100',
                deleting && 'opacity-100 text-red-500'
              )}
            >
              {deleting ? '…' : '✕'}
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-zinc-400">
            {formatRelativeTime(session.created_at)}
          </span>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
            Delete failed: {error}
          </p>
        ) : null}
      </div>
    </Link>
  )
}
