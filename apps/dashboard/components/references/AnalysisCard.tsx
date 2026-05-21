'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VideoAnalysis, VideoAnalysisStatus } from '@shaq-os/database-types'
import { cn, formatRelativeTime } from '@/lib/utils'

const STATUS_LABEL: Record<VideoAnalysisStatus, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-zinc-100 text-zinc-600' },
  downloading: { label: 'Downloading', className: 'bg-blue-100 text-blue-700' },
  extracting: { label: 'Extracting frames', className: 'bg-blue-100 text-blue-700' },
  transcribing: { label: 'Transcribing', className: 'bg-indigo-100 text-indigo-700' },
  analyzing: { label: 'Analyzing', className: 'bg-purple-100 text-purple-700' },
  complete: { label: 'Complete', className: 'bg-green-100 text-green-700' },
  error: { label: 'Error', className: 'bg-red-100 text-red-700' },
}

interface AnalysisShape {
  hook?: string
  structure?: string
  pacing?: string
  shot_list?: Array<{ shot_n: number; description: string; est_duration_s?: number }>
  captions_used?: string
  music_and_audio?: string
  hypothesized_why_it_works?: string[]
  risks_if_replicated?: string[]
}

export function AnalysisCard({ analysis: row }: { analysis: VideoAnalysis }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const status = row.status as VideoAnalysisStatus
  const statusConfig = STATUS_LABEL[status] ?? STATUS_LABEL.queued
  const meta = (row.raw_metadata ?? {}) as Record<string, unknown>
  const title =
    (typeof meta.title === 'string' && meta.title) ||
    (typeof meta.uploader === 'string' && `@${meta.uploader}`) ||
    new URL(row.source_url).hostname.replace(/^www\./, '')
  const analysis = (row.analysis ?? null) as AnalysisShape | null
  const keyframes = (row.keyframe_paths ?? []) as string[]
  const hasKeyframes = keyframes.length > 0
  const isComplete = status === 'complete' && analysis
  const isError = status === 'error'

  async function handleDelete() {
    if (deleting) return
    if (!confirm('Delete this analysis? This cannot be undone.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/video-jobs/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.message || `Delete failed: ${res.status}`)
      }
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                statusConfig.className
              )}
            >
              {statusConfig.label}
            </span>
            {row.source_platform ? (
              <span className="text-xs text-zinc-400 uppercase tracking-wide">
                {row.source_platform}
              </span>
            ) : null}
            <span className="text-xs text-zinc-400">
              {formatRelativeTime(row.created_at)}
            </span>
          </div>
          <h3 className="font-semibold text-zinc-900 text-sm leading-snug line-clamp-2">
            {title}
          </h3>
          <a
            href={row.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-900 underline decoration-zinc-300 hover:decoration-zinc-700 line-clamp-1"
          >
            {row.source_url}
          </a>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 text-xs text-zinc-400 hover:text-red-700 transition-colors px-2 py-1"
          aria-label="Delete analysis"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>

      {/* Error message */}
      {isError && row.error_message ? (
        <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {row.error_message}
        </p>
      ) : null}

      {/* In-progress hint */}
      {!isComplete && !isError ? (
        <p className="mt-3 text-xs text-zinc-500">
          Pipeline running. This page auto-refreshes every 3 seconds.
        </p>
      ) : null}

      {/* Completed analysis */}
      {isComplete && analysis ? (
        <div className="mt-4 space-y-3">
          {/* Keyframe strip — always visible when complete */}
          {hasKeyframes ? (
            <div>
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
                Keyframes ({keyframes.length})
              </h4>
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                {keyframes.map((_, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={`/api/keyframes/${row.id}/${i}`}
                    alt={`Frame ${i + 1}`}
                    className="h-24 w-auto rounded-md border border-zinc-200 shrink-0 bg-zinc-100"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          ) : null}

          <Section title="Hook" body={analysis.hook} />
          {expanded ? (
            <>
              <Section title="Structure" body={analysis.structure} />
              <Section title="Pacing" body={analysis.pacing} />
              {analysis.shot_list && analysis.shot_list.length > 0 ? (
                <ShotList shots={analysis.shot_list} keyframes={keyframes} jobId={row.id} />
              ) : null}
              {analysis.captions_used ? (
                <Section title="Captions" body={analysis.captions_used} />
              ) : null}
              {analysis.music_and_audio ? (
                <Section title="Music / audio" body={analysis.music_and_audio} />
              ) : null}
              {analysis.hypothesized_why_it_works ? (
                <BulletSection
                  title="Why it works (hypotheses)"
                  items={analysis.hypothesized_why_it_works}
                />
              ) : null}
              {analysis.risks_if_replicated ? (
                <BulletSection
                  title="Risks if replicated"
                  items={analysis.risks_if_replicated}
                />
              ) : null}
              {row.transcript ? (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Transcript
                  </summary>
                  <p className="mt-2 text-zinc-700 whitespace-pre-wrap">
                    {row.transcript}
                  </p>
                </details>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            {expanded ? '← Collapse' : 'Show full analysis →'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Section({ title, body }: { title: string; body?: string }) {
  if (!body) return null
  return (
    <div>
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
        {title}
      </h4>
      <p className="text-sm text-zinc-700 leading-relaxed">{body}</p>
    </div>
  )
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
        {title}
      </h4>
      <ul className="text-sm text-zinc-700 space-y-1 pl-5 list-disc">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Shot list, with each entry paired to the closest keyframe by relative
 * position. The keyframes were extracted evenly across the video's
 * duration, so shot N out of M shots maps roughly to keyframe
 * round((N-1) * (K-1) / (M-1)).
 */
function ShotList({
  shots,
  keyframes,
  jobId,
}: {
  shots: Array<{ shot_n: number; description: string; est_duration_s?: number }>
  keyframes: string[]
  jobId: string
}) {
  function frameIndexForShot(i: number, total: number, frames: number) {
    if (frames <= 0 || total <= 1) return 0
    return Math.min(frames - 1, Math.round((i * (frames - 1)) / (total - 1)))
  }
  return (
    <div>
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">
        Shot list
      </h4>
      <ol className="space-y-2">
        {shots.map((shot, i) => {
          const frameIdx = frameIndexForShot(i, shots.length, keyframes.length)
          const hasFrame = keyframes.length > 0
          return (
            <li
              key={shot.shot_n}
              className="flex gap-3 items-start bg-zinc-50 rounded-md p-2"
            >
              {hasFrame ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/keyframes/${jobId}/${frameIdx}`}
                  alt={`Approximate frame for shot ${shot.shot_n}`}
                  className="h-16 w-auto rounded-md border border-zinc-200 shrink-0 bg-zinc-100"
                  loading="lazy"
                />
              ) : null}
              <div className="text-sm text-zinc-700 leading-snug">
                <span className="font-semibold text-zinc-900">{shot.shot_n}.</span>{' '}
                {shot.description}
                {typeof shot.est_duration_s === 'number' ? (
                  <span className="text-zinc-400">
                    {' '}
                    ({shot.est_duration_s.toFixed(1)}s)
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      <p className="mt-1.5 text-[10px] text-zinc-400">
        Frames are approximate — keyframes were sampled at fixed intervals, not at
        shot boundaries.
      </p>
    </div>
  )
}
