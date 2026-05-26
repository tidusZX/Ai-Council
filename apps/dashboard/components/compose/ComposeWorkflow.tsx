'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'

type Format = 'CAROUSEL' | 'SINGLE' | 'EDUCATIONAL' | 'RE-EDIT'
type Status = 'Idea' | 'Planned' | 'Scheduled' | 'Published'
type Mode = 'brainstorm' | 'audience' | 'voice' | 'fromImages'

interface ImageComposition {
  title: string
  hook: string
  format: Format
  draftCaption: string
  hashtags: string[]
  inferredSubject: string
  suggestedClient: string | null
  confidence: number
  flags: string[]
}

const FORMAT_ICON: Record<Format, string> = {
  CAROUSEL: '🎠',
  SINGLE: '🖼',
  EDUCATIONAL: '🎓',
  'RE-EDIT': '✏️',
}

const SEVERITY_LABEL = ['', 'low', 'medium', 'high']

// ============================================================================
// Shared types
// ============================================================================

interface SharpenResult {
  sharpenedCaption: string
  angle: string
  changesSummary: string[]
  bannedWordsRemoved: string[]
  ctaUsed: string
  confidence: number
  flags: string[]
  hashtags: string[]
  fullPost: string | null
}

interface Idea {
  title: string
  hook: string
  format: Format
  draftCaption: string
  rationale: string
  sharpened?: SharpenResult
  useSharpened?: boolean
}

interface Angle {
  id: string
  topic: string
  painPointId: string
  format: Format
  oneLineHook: string
  why: string
}
interface PainPoint {
  id: string
  headline: string
  evidence: string
  severity: number
}
interface KnowledgeGap {
  id: string
  headline: string
  whyItMatters: string
}
interface DecisionPattern {
  id: string
  observation: string
  implicationForContent: string
}
interface AudienceSignal {
  summary: string
  painPoints: PainPoint[]
  knowledgeGaps: KnowledgeGap[]
  decisionPatterns: DecisionPattern[]
  angles: Angle[]
  topPicks: string[]
}

interface VoiceState {
  draftCaption: string
  title: string
  client: string
  hook: string
  format: Format
  includeHashtags: boolean
  includeFullPost: boolean
  result: SharpenResult | null
}

// ============================================================================
// Component
// ============================================================================

export function ComposeWorkflow() {
  // ---------- mode + shared error ----------
  const [mode, setMode] = useState<Mode>('brainstorm')
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<
    'idle' | 'running' | 'sharpening' | 'sending'
  >('idle')

  // ---------- brainstorm + audience-signal inputs ----------
  const [topic, setTopic] = useState(
    'educational posts about food photography craft'
  )
  const [count, setCount] = useState(5)

  // ---------- brainstorm results ----------
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [checked, setChecked] = useState<Set<number>>(new Set())

  // ---------- audience signal results ----------
  const [signal, setSignal] = useState<AudienceSignal | null>(null)

  // ---------- voice state ----------
  const [voice, setVoice] = useState<VoiceState>({
    draftCaption: '',
    title: '',
    client: '',
    hook: '',
    format: 'SINGLE',
    includeHashtags: true,
    includeFullPost: true,
    result: null,
  })
  const voiceDraftRef = useRef<HTMLTextAreaElement | null>(null)

  // ---------- fromImages mode state ----------
  const [fromImagesUrls, setFromImagesUrls] = useState<string[]>([])
  const [fromImagesUploading, setFromImagesUploading] = useState(false)
  const [fromImagesUploadError, setFromImagesUploadError] = useState<
    string | null
  >(null)
  const [fromImagesContext, setFromImagesContext] = useState('')
  const [fromImagesClient, setFromImagesClient] = useState('')
  const [imageComposition, setImageComposition] =
    useState<ImageComposition | null>(null)
  // After composing, user can sharpen with Ember (reuses voice.result shape).
  const [imageCompSharpened, setImageCompSharpened] = useState<SharpenResult | null>(
    null
  )
  const [useImageCompSharpened, setUseImageCompSharpened] = useState(false)

  // ---------- shared "Send to Notion" form ----------
  const [notionStatus, setNotionStatus] = useState<Status>('Planned')
  const [notionScheduledDate, setNotionScheduledDate] = useState('')
  const [notionImageUrl, setNotionImageUrl] = useState('')
  const [notionImageUrls, setNotionImageUrls] = useState<string[]>([])
  const [notionUploading, setNotionUploading] = useState(false)
  const [notionUploadError, setNotionUploadError] = useState<string | null>(null)
  const [notionSendResult, setNotionSendResult] = useState<{
    inserted: number
    pageIds: string[]
    errors: string[]
  } | null>(null)

  async function handleNotionFileUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''
    setNotionUploadError(null)
    setNotionUploading(true)
    try {
      const newUrls: string[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/uploads/council-attachment', {
          method: 'POST',
          body: fd,
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(body?.message || body?.error || `Status ${res.status}`)
        }
        newUrls.push(body.url)
      }
      setNotionImageUrls((prev) => [...prev, ...newUrls].slice(0, 10))
    } catch (err) {
      setNotionUploadError(err instanceof Error ? err.message : String(err))
    } finally {
      setNotionUploading(false)
    }
  }

  function removeNotionImageAt(idx: number) {
    setNotionImageUrls((prev) => prev.filter((_, i) => i !== idx))
  }

  const [copied, setCopied] = useState<string | null>(null)

  // ---------- reset on mode change ----------
  function setModeReset(next: Mode) {
    setMode(next)
    setError(null)
    setPhase('idle')
    setChecked(new Set())
    setNotionSendResult(null)
  }

  async function handleFromImagesUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = ''
    setFromImagesUploadError(null)
    setFromImagesUploading(true)
    try {
      const newUrls: string[] = []
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/uploads/council-attachment', {
          method: 'POST',
          body: fd,
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(body?.message || body?.error || `Status ${res.status}`)
        }
        newUrls.push(body.url)
      }
      setFromImagesUrls((prev) => [...prev, ...newUrls].slice(0, 10))
    } catch (err) {
      setFromImagesUploadError(err instanceof Error ? err.message : String(err))
    } finally {
      setFromImagesUploading(false)
    }
  }

  function removeFromImageAt(idx: number) {
    setFromImagesUrls((prev) => prev.filter((_, i) => i !== idx))
  }

  async function runFromImages() {
    if (fromImagesUrls.length === 0) {
      setError('Upload at least one image to compose from.')
      return
    }
    setError(null)
    setImageComposition(null)
    setImageCompSharpened(null)
    setUseImageCompSharpened(false)
    setNotionSendResult(null)
    setPhase('running')
    try {
      const res = await fetch('/api/compose/from-images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          imageUrls: fromImagesUrls,
          context: fromImagesContext.trim() || undefined,
          client: fromImagesClient.trim() || undefined,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setImageComposition(body as ImageComposition)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  async function sharpenImageComposition() {
    if (!imageComposition) return
    setError(null)
    setPhase('sharpening')
    try {
      const res = await fetch('/api/voice/sharpen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draftCaption: imageComposition.draftCaption,
          title: imageComposition.title,
          hook: imageComposition.hook,
          format: imageComposition.format,
          client: imageComposition.suggestedClient ?? undefined,
          includeHashtags: true,
          includeFullPost: true,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setImageCompSharpened(body as SharpenResult)
      setUseImageCompSharpened(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  // ============================================================================
  // ACTIONS
  // ============================================================================

  async function runBrainstorm() {
    setError(null)
    setIdeas([])
    setChecked(new Set())
    setSignal(null)
    setNotionSendResult(null)
    setPhase('running')
    try {
      const res = await fetch('/api/brainstorm/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, count }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ideas) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setIdeas(body.ideas as Idea[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  async function runAudience() {
    setError(null)
    setIdeas([])
    setSignal(null)
    setNotionSendResult(null)
    setPhase('running')
    try {
      const res = await fetch('/api/audience-signal/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setSignal(body as AudienceSignal)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  function sendAngleToBrainstorm(a: Angle) {
    setMode('brainstorm')
    setTopic(a.topic)
    setSignal(null)
    setIdeas([])
    setChecked(new Set())
    setError(null)
    setPhase('idle')
  }

  async function runVoice() {
    setError(null)
    setVoice((v) => ({ ...v, result: null }))
    setNotionSendResult(null)
    if (!voice.draftCaption.trim() || voice.draftCaption.trim().length < 5) {
      setError('Draft caption must be at least 5 characters.')
      return
    }
    setPhase('running')
    try {
      const res = await fetch('/api/voice/sharpen', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          draftCaption: voice.draftCaption.trim(),
          title: voice.title.trim() || undefined,
          client: voice.client.trim() || undefined,
          hook: voice.hook.trim() || undefined,
          format: voice.format,
          includeHashtags: voice.includeHashtags,
          includeFullPost: voice.includeFullPost,
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setVoice((v) => ({ ...v, result: body as SharpenResult }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  async function sharpenSelectedBrainstorm() {
    if (checked.size === 0) return
    setError(null)
    setPhase('sharpening')
    try {
      const indexes = Array.from(checked)
      const results = await Promise.all(
        indexes.map(async (i) => {
          const idea = ideas[i]
          const res = await fetch('/api/voice/sharpen', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              draftCaption: idea.draftCaption,
              title: idea.title,
              hook: idea.hook,
              format: idea.format,
              includeHashtags: true,
              includeFullPost: false,
            }),
          })
          const body = await res.json().catch(() => null)
          if (!res.ok) {
            throw new Error(
              body?.message || body?.error || `Sharpen failed (${res.status})`
            )
          }
          return [i, body as SharpenResult] as const
        })
      )
      setIdeas((prev) => {
        const next = [...prev]
        for (const [i, sharpened] of results) {
          if (sharpened)
            next[i] = { ...next[i], sharpened, useSharpened: true }
        }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  // Blotato/Instagram caps captions at 5 hashtags. Live-count whichever
  // caption *will* be sent (depends on mode + sharpener toggle) so the
  // user sees the problem before clicking Send to Notion.
  const hashtagWarning = useMemo(() => {
    function count(s: string | null | undefined): number {
      return s ? (s.match(/(?:^|\s)#\w+/g) ?? []).length : 0
    }
    if (mode === 'voice') {
      const text =
        voice.result?.fullPost ?? voice.result?.sharpenedCaption ?? null
      const c = count(text)
      return c > 5 ? { count: c, where: null as string | null } : null
    }
    if (mode === 'fromImages') {
      const useSharp = useImageCompSharpened && imageCompSharpened
      const text = useSharp
        ? (imageCompSharpened!.fullPost ?? imageCompSharpened!.sharpenedCaption)
        : (imageComposition?.draftCaption ?? null)
      const c = count(text)
      return c > 5 ? { count: c, where: null as string | null } : null
    }
    if (mode === 'brainstorm') {
      let worst: { count: number; where: string | null } | null = null
      for (const i of Array.from(checked)) {
        const idea = ideas[i]
        if (!idea) continue
        const useSharp = idea.useSharpened && idea.sharpened
        const text = useSharp
          ? (idea.sharpened!.fullPost ?? idea.sharpened!.sharpenedCaption)
          : idea.draftCaption
        const c = count(text)
        if (c > 5 && (!worst || c > worst.count)) {
          worst = { count: c, where: idea.title }
        }
      }
      return worst
    }
    return null
  }, [
    mode,
    voice.result,
    useImageCompSharpened,
    imageCompSharpened,
    imageComposition,
    checked,
    ideas,
  ])

  // Single unified Notion writer. Builds an items[] payload based on mode +
  // current state, then POSTs /api/import-existing (the same endpoint /import
  // uses for bulk adds).
  async function sendToNotion() {
    setError(null)
    setNotionSendResult(null)

    // Drive textarea → one URL per line, in slide order.
    const driveUrls = notionImageUrl
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    const mergeUrls = (extra: string[] = []): string[] | undefined => {
      const merged = Array.from(
        new Set([...extra, ...driveUrls, ...notionImageUrls])
      ).slice(0, 10)
      return merged.length > 0 ? merged : undefined
    }

    const items: Array<{
      title: string
      format: Format
      draftCaption: string
      status: Status
      client?: string
      hook?: string
      hashtags?: string[]
      scheduledDate?: string
      imageUrl?: string
      imageUrls?: string[]
      shootName?: string
    }> = []

    if (mode === 'voice' && voice.result) {
      const captionToSend =
        voice.result.fullPost ?? voice.result.sharpenedCaption
      const title =
        voice.title.trim() || voice.draftCaption.slice(0, 60) + '…'
      items.push({
        title,
        format: voice.format,
        draftCaption: captionToSend,
        status: notionStatus,
        client: voice.client.trim() || undefined,
        hook: voice.hook.trim() || undefined,
        hashtags: voice.result.hashtags.length
          ? voice.result.hashtags.map((h) => h.replace(/^#/, ''))
          : undefined,
        scheduledDate: notionScheduledDate || undefined,
        imageUrls: mergeUrls(),
        shootName: voice.client.trim() || `Voice: ${topic.slice(0, 50)}`,
      })
    } else if (mode === 'fromImages' && imageComposition) {
      const useSharp = useImageCompSharpened && imageCompSharpened
      const captionToSend = useSharp
        ? (imageCompSharpened!.fullPost ?? imageCompSharpened!.sharpenedCaption)
        : imageComposition.draftCaption
      const hashtagsToSend =
        useSharp && imageCompSharpened!.hashtags.length
          ? imageCompSharpened!.hashtags.map((h) => h.replace(/^#/, ''))
          : imageComposition.hashtags.map((h) => h.replace(/^#/, ''))
      items.push({
        title: imageComposition.title,
        format: imageComposition.format,
        draftCaption: captionToSend,
        status: notionStatus,
        client:
          imageComposition.suggestedClient ??
          fromImagesClient.trim() ??
          undefined,
        hook: imageComposition.hook,
        hashtags: hashtagsToSend.length ? hashtagsToSend : undefined,
        scheduledDate: notionScheduledDate || undefined,
        // In From-Images mode, the composed slides ARE the carousel. We
        // deliberately DON'T merge in Drive-textarea links or drag-dropped
        // uploads from the Send-to-Notion form — those represent the same
        // slides re-supplied via a different surface, and string-level
        // dedup can't catch the Supabase-vs-Drive URL difference, so they
        // end up appended as duplicate carousel entries (bug seen on the
        // June 7 row: 6 unique + 4 dupes = 10 slides on IG + LinkedIn).
        // If a user genuinely needs different slides, they should re-run
        // From Images with new input rather than topping up via the form.
        imageUrls:
          fromImagesUrls.length > 0
            ? fromImagesUrls.slice(0, 10)
            : mergeUrls(),
        shootName:
          imageComposition.suggestedClient ??
          fromImagesClient.trim() ??
          'From Images',
      })
    } else if (mode === 'brainstorm' && checked.size > 0) {
      for (const i of Array.from(checked)) {
        const idea = ideas[i]
        const useSharp = idea.useSharpened && idea.sharpened
        const captionToSend = useSharp
          ? (idea.sharpened!.fullPost ?? idea.sharpened!.sharpenedCaption)
          : idea.draftCaption
        items.push({
          title: idea.title,
          format: idea.format,
          draftCaption: captionToSend,
          status: notionStatus,
          hook: idea.hook,
          hashtags: useSharp && idea.sharpened!.hashtags.length
            ? idea.sharpened!.hashtags.map((h) => h.replace(/^#/, ''))
            : undefined,
          scheduledDate: notionScheduledDate || undefined,
          imageUrls: mergeUrls(),
          shootName: `Brainstorm: ${topic.slice(0, 50)}`,
        })
      }
    } else {
      setError(
        'Nothing to send — generate or select content first, then try again.'
      )
      return
    }

    setPhase('sending')
    try {
      const res = await fetch('/api/import-existing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Status ${res.status}`)
      }
      setNotionSendResult({
        inserted: body?.inserted ?? 0,
        pageIds: (body?.items ?? []).map((it: { notionPageId: string }) => it.notionPageId),
        errors: body?.errors ?? [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPhase('idle')
    }
  }

  function toggle(i: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }
  function toggleSharpenedFor(i: number) {
    setIdeas((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], useSharpened: !next[i].useSharpened }
      return next
    })
  }

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500)
    } catch {
      // clipboard blocked
    }
  }

  // Focus the voice draft textarea when switching to voice mode.
  useEffect(() => {
    if (mode === 'voice') {
      setTimeout(() => voiceDraftRef.current?.focus(), 50)
    }
  }, [mode])

  const isBusy =
    phase === 'running' || phase === 'sharpening' || phase === 'sending'

  // Send-to-Notion is available when there's something to send.
  const hasSomethingToSend =
    (mode === 'voice' && voice.result !== null) ||
    (mode === 'brainstorm' && checked.size > 0) ||
    (mode === 'fromImages' && imageComposition !== null)

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* MODE SELECTOR */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-zinc-500 mr-1">Mode:</span>
          {(
            [
              ['brainstorm', '🎨', 'Brainstorm', 'topic → N ideas'],
              ['audience', '🔍', 'Audience Signal', 'ICP research'],
              ['voice', '🔥', 'Voice', 'sharpen a draft'],
              ['fromImages', '📸', 'From Images', 'AI infers post from photos'],
            ] as const
          ).map(([m, icon, label, hint]) => {
            const on = mode === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => setModeReset(m)}
                disabled={isBusy}
                className={`text-sm px-3 py-1.5 rounded-md border transition ${
                  on
                    ? 'bg-zinc-900 text-white border-zinc-900'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500'
                }`}
                title={hint}
              >
                {icon} {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* INPUT — brainstorm/audience share a topic field */}
      {mode === 'brainstorm' || mode === 'audience' ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={
              mode === 'audience'
                ? "What audience to research? e.g. 'Mid-sized SG F&B brands considering a brand refresh'"
                : "What should I brainstorm? e.g. 'Educational carousel: Your food looks incredible in person'"
            }
            disabled={isBusy}
            rows={2}
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {mode === 'brainstorm' ? (
              <div className="flex items-center gap-2 text-sm text-zinc-700">
                <span>How many?</span>
                <Input
                  type="number"
                  min={3}
                  max={10}
                  value={count}
                  onChange={(e) =>
                    setCount(
                      Math.min(10, Math.max(3, Number(e.target.value) || 5))
                    )
                  }
                  disabled={isBusy}
                  className="w-20"
                />
              </div>
            ) : (
              <div />
            )}
            <Button
              type="button"
              onClick={mode === 'audience' ? runAudience : runBrainstorm}
              disabled={isBusy || !topic.trim()}
            >
              {phase === 'running'
                ? mode === 'audience'
                  ? 'Researching… (~30s)'
                  : 'Brainstorming… (~30s)'
                : ideas.length > 0 || signal
                  ? 'Re-run'
                  : mode === 'audience'
                    ? 'Run audience signal'
                    : 'Brainstorm'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* INPUT — voice */}
      {mode === 'voice' ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <Textarea
            ref={voiceDraftRef}
            value={voice.draftCaption}
            onChange={(e) =>
              setVoice((v) => ({ ...v, draftCaption: e.target.value }))
            }
            rows={6}
            disabled={isBusy}
            placeholder="Paste your caption draft here. Anything from a one-liner to a 400-word post."
          />

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs text-zinc-600">
                Title <span className="text-zinc-400">(optional)</span>
              </span>
              <Input
                value={voice.title}
                onChange={(e) =>
                  setVoice((v) => ({ ...v, title: e.target.value }))
                }
                placeholder="e.g. Prosperity Pals — McDonald's"
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">
                Client <span className="text-zinc-400">(optional)</span>
              </span>
              <Input
                value={voice.client}
                onChange={(e) =>
                  setVoice((v) => ({ ...v, client: e.target.value }))
                }
                placeholder="e.g. McDonald's Singapore"
                disabled={isBusy}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">Format</span>
              <select
                value={voice.format}
                onChange={(e) =>
                  setVoice((v) => ({ ...v, format: e.target.value as Format }))
                }
                disabled={isBusy}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="CAROUSEL">🎠 Carousel</option>
                <option value="SINGLE">🖼 Single</option>
                <option value="EDUCATIONAL">🎓 Educational</option>
                <option value="RE-EDIT">✏️ Re-edit</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">
                Hook <span className="text-zinc-400">(optional)</span>
              </span>
              <Input
                value={voice.hook}
                onChange={(e) =>
                  setVoice((v) => ({ ...v, hook: e.target.value }))
                }
                placeholder="The first line you have in mind"
                disabled={isBusy}
              />
            </label>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={voice.includeHashtags}
                onChange={(e) =>
                  setVoice((v) => ({ ...v, includeHashtags: e.target.checked }))
                }
                disabled={isBusy}
                className="accent-amber-600"
              />
              Generate hashtags
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={voice.includeFullPost}
                onChange={(e) =>
                  setVoice((v) => ({ ...v, includeFullPost: e.target.checked }))
                }
                disabled={isBusy}
                className="accent-amber-600"
              />
              Compose full post
            </label>
            <Button
              type="button"
              onClick={runVoice}
              disabled={isBusy || voice.draftCaption.trim().length < 5}
              className="ml-auto bg-amber-600 hover:bg-amber-700"
            >
              {phase === 'running' ? 'Sharpening…' : '🔥 Sharpen with Ember'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* INPUT — fromImages */}
      {mode === 'fromImages' ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-zinc-700 font-medium">
                Drop carousel slides (or a single hero) here:
              </span>
              <label
                className={`text-sm px-3 py-1.5 rounded-md border border-zinc-300 cursor-pointer hover:border-zinc-500 hover:bg-zinc-50 transition ${
                  fromImagesUploading ||
                  isBusy ||
                  fromImagesUrls.length >= 10
                    ? 'opacity-50 pointer-events-none'
                    : ''
                }`}
              >
                {fromImagesUploading
                  ? 'Uploading…'
                  : '📎 Upload images from device'}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={handleFromImagesUpload}
                  disabled={
                    fromImagesUploading ||
                    isBusy ||
                    fromImagesUrls.length >= 10
                  }
                  className="hidden"
                />
              </label>
              {fromImagesUrls.length > 0 ? (
                <span className="text-xs text-zinc-500">
                  {fromImagesUrls.length} attached (max 10)
                </span>
              ) : null}
            </div>
            {fromImagesUrls.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {fromImagesUrls.map((url, idx) => (
                  <div
                    key={url + idx}
                    className="relative group rounded-md overflow-hidden border border-zinc-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`slide ${idx + 1}`}
                      className="w-24 h-24 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeFromImageAt(idx)}
                      disabled={isBusy}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-zinc-900/70 text-white text-xs flex items-center justify-center hover:bg-red-600 transition"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {fromImagesUploadError ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                Upload failed: {fromImagesUploadError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs text-zinc-600">
                Context <span className="text-zinc-400">(optional)</span>
              </span>
              <Textarea
                value={fromImagesContext}
                onChange={(e) => setFromImagesContext(e.target.value)}
                rows={2}
                disabled={isBusy}
                placeholder="e.g. This is the carousel I shot for a new café opening on Telok Ayer"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">
                Client <span className="text-zinc-400">(optional)</span>
              </span>
              <Input
                value={fromImagesClient}
                onChange={(e) => setFromImagesClient(e.target.value)}
                disabled={isBusy}
                placeholder="e.g. McDonald's Singapore"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={runFromImages}
              disabled={isBusy || fromImagesUrls.length === 0}
            >
              {phase === 'running' ? 'Composing… (~30s)' : '📸 Compose from images'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* ERROR */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      ) : null}

      {/* AUDIENCE SIGNAL RESULTS */}
      {mode === 'audience' && signal ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
            <h3 className="text-sm font-semibold text-indigo-900">Summary</h3>
            <p className="text-sm text-indigo-900 mt-1">{signal.summary}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Pain points
              </h3>
              <ul className="mt-3 space-y-2">
                {signal.painPoints.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-zinc-100 bg-zinc-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        {p.headline}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {SEVERITY_LABEL[p.severity] ?? p.severity}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1">{p.evidence}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-zinc-900">
                Knowledge gaps
              </h3>
              <ul className="mt-3 space-y-2">
                {signal.knowledgeGaps.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-md border border-zinc-100 bg-zinc-50 p-3"
                  >
                    <p className="text-sm font-medium text-zinc-900">
                      {g.headline}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">{g.whyItMatters}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-zinc-900">
              Decision patterns
            </h3>
            <ul className="mt-3 space-y-2">
              {signal.decisionPatterns.map((d) => (
                <li
                  key={d.id}
                  className="rounded-md border border-zinc-100 bg-zinc-50 p-3"
                >
                  <p className="text-sm text-zinc-900">{d.observation}</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    → {d.implicationForContent}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">
                {signal.angles.length} brainstormable angles
              </h3>
              <span className="text-xs text-zinc-500">
                Top picks highlighted. Click "Send to Brainstorm" to feed it
                into the Brainstorm mode.
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {signal.angles.map((a) => {
                const isTop = signal.topPicks.includes(a.id)
                return (
                  <li
                    key={a.id}
                    className={`rounded-md border p-3 flex items-start justify-between gap-3 ${
                      isTop
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-zinc-100 bg-zinc-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-200 bg-white text-zinc-700">
                          {FORMAT_ICON[a.format]} {a.format}
                        </span>
                        {isTop ? (
                          <span className="text-[10px] uppercase tracking-wide text-emerald-700">
                            top pick
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium text-zinc-900 mt-2">
                        {a.topic}
                      </p>
                      <p className="text-xs italic text-zinc-600 mt-1">
                        "{a.oneLineHook}"
                      </p>
                      <p className="text-xs text-zinc-500 mt-2">{a.why}</p>
                    </div>
                    <Button
                      type="button"
                      onClick={() => sendAngleToBrainstorm(a)}
                      className="shrink-0"
                    >
                      Send to Brainstorm →
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {/* BRAINSTORM RESULTS */}
      {mode === 'brainstorm' && ideas.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              {ideas.length} ideas · {checked.size} selected
            </h3>
            <button
              type="button"
              onClick={() =>
                setChecked(
                  checked.size === ideas.length
                    ? new Set()
                    : new Set(ideas.map((_, i) => i))
                )
              }
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              {checked.size === ideas.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {ideas.map((idea, i) => {
            const isChecked = checked.has(i)
            const showingSharpened = !!(idea.useSharpened && idea.sharpened)
            return (
              <label
                key={i}
                className={`block rounded-xl border p-5 cursor-pointer transition-colors ${
                  isChecked
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(i)}
                    className="mt-1 w-4 h-4 accent-emerald-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
                        {FORMAT_ICON[idea.format]} {idea.format}
                      </span>
                      <h4 className="text-base font-semibold text-zinc-900">
                        {idea.title}
                      </h4>
                      {idea.sharpened ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            toggleSharpenedFor(i)
                          }}
                          className={`ml-auto text-[11px] px-2 py-0.5 rounded-md border ${
                            showingSharpened
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-zinc-200 bg-white text-zinc-600'
                          }`}
                        >
                          {showingSharpened ? '🔥 Ember' : 'Original'}
                        </button>
                      ) : null}
                    </div>
                    <p className="text-sm text-zinc-700 italic mt-2">
                      "{idea.hook}"
                    </p>
                    <p className="text-sm text-zinc-800 mt-2 whitespace-pre-wrap">
                      {showingSharpened
                        ? idea.sharpened!.sharpenedCaption
                        : idea.draftCaption}
                    </p>
                    {showingSharpened && idea.sharpened ? (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold text-amber-900">
                          Ember pass — confidence {idea.sharpened.confidence}/3 ·
                          CTA: {idea.sharpened.ctaUsed}
                        </p>
                        {idea.sharpened.changesSummary.length ? (
                          <ul className="text-xs text-amber-900 mt-2 list-disc pl-4 space-y-0.5">
                            {idea.sharpened.changesSummary.map((c, k) => (
                              <li key={k}>{c}</li>
                            ))}
                          </ul>
                        ) : null}
                        {idea.sharpened.hashtags.length ? (
                          <p className="text-[11px] text-amber-800 mt-2">
                            +{idea.sharpened.hashtags.length} hashtags ready
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="text-xs text-zinc-500 mt-3">{idea.rationale}</p>
                  </div>
                </div>
              </label>
            )
          })}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-emerald-900">
              {checked.size} selected — sharpen with Ember, then send to Notion.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={sharpenSelectedBrainstorm}
                disabled={isBusy || checked.size === 0}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {phase === 'sharpening' ? 'Sharpening…' : '🔥 Sharpen selected'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* VOICE RESULT */}
      {mode === 'voice' && voice.result ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                Your draft
              </h3>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                {voice.draftCaption}
              </p>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                  🔥 Ember sharpened · {voice.result.confidence}/3
                </h3>
                <button
                  type="button"
                  onClick={() => copyText('caption', voice.result!.sharpenedCaption)}
                  className="text-xs px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  {copied === 'caption' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <p className="text-sm text-zinc-900 whitespace-pre-wrap">
                {voice.result.sharpenedCaption}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
            <div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                Angle:
              </span>{' '}
              <span className="text-sm text-zinc-900">{voice.result.angle}</span>
            </div>
            <div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider">
                CTA:
              </span>{' '}
              <span className="text-sm font-mono text-zinc-900">
                {voice.result.ctaUsed}
              </span>
            </div>
            {voice.result.changesSummary.length > 0 ? (
              <div>
                <span className="text-xs text-zinc-500 uppercase tracking-wider">
                  Changes:
                </span>
                <ul className="text-sm text-zinc-700 list-disc pl-5 mt-1 space-y-0.5">
                  {voice.result.changesSummary.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {voice.result.hashtags.length > 0 ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-indigo-800 uppercase tracking-wider">
                  Hashtags ({voice.result.hashtags.length})
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    copyText('tags', voice.result!.hashtags.join(' '))
                  }
                  className="text-xs px-2 py-1 rounded-md bg-white border border-indigo-300 text-indigo-800 hover:bg-indigo-100"
                >
                  {copied === 'tags' ? 'Copied ✓' : 'Copy all'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {voice.result.hashtags.map((h) => (
                  <span
                    key={h}
                    className="text-xs px-2 py-1 rounded-md bg-white border border-indigo-200 text-indigo-900 font-mono"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {voice.result.fullPost ? (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                  Full post (paste this into Instagram)
                </h3>
                <button
                  type="button"
                  onClick={() => copyText('post', voice.result!.fullPost ?? '')}
                  className="text-xs px-2 py-1 rounded-md bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                >
                  {copied === 'post' ? 'Copied ✓' : 'Copy post'}
                </button>
              </div>
              <p className="text-sm text-zinc-900 whitespace-pre-wrap font-mono">
                {voice.result.fullPost}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* FROM IMAGES RESULT */}
      {mode === 'fromImages' && imageComposition ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <h3 className="text-xs font-semibold text-indigo-900 uppercase tracking-wider">
              What I see in the images · confidence {imageComposition.confidence}/3
            </h3>
            <p className="text-sm text-indigo-900 mt-1">
              {imageComposition.inferredSubject}
            </p>
            {imageComposition.suggestedClient ? (
              <p className="text-xs text-indigo-700 mt-1">
                Suggested client: <strong>{imageComposition.suggestedClient}</strong>
              </p>
            ) : null}
            {imageComposition.flags.length > 0 ? (
              <p className="text-xs text-red-700 mt-2">
                ⚠ Flags: {imageComposition.flags.join('; ')}
              </p>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700">
                {FORMAT_ICON[imageComposition.format]} {imageComposition.format}
              </span>
              <h4 className="text-base font-semibold text-zinc-900">
                {imageComposition.title}
              </h4>
              {imageCompSharpened ? (
                <button
                  type="button"
                  onClick={() => setUseImageCompSharpened((v) => !v)}
                  className={`ml-auto text-[11px] px-2 py-0.5 rounded-md border ${
                    useImageCompSharpened
                      ? 'border-amber-300 bg-amber-50 text-amber-800'
                      : 'border-zinc-200 bg-white text-zinc-600'
                  }`}
                >
                  {useImageCompSharpened ? '🔥 Ember' : 'Original'}
                </button>
              ) : null}
            </div>
            <p className="text-sm italic text-zinc-600 mt-2">
              "{imageComposition.hook}"
            </p>
            <p className="text-sm text-zinc-800 mt-2 whitespace-pre-wrap">
              {useImageCompSharpened && imageCompSharpened
                ? (imageCompSharpened.fullPost ??
                    imageCompSharpened.sharpenedCaption)
                : imageComposition.draftCaption}
            </p>
            {(useImageCompSharpened && imageCompSharpened
              ? imageCompSharpened.hashtags
              : imageComposition.hashtags
            ).length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {(useImageCompSharpened && imageCompSharpened
                  ? imageCompSharpened.hashtags
                  : imageComposition.hashtags
                ).map((h) => (
                  <span
                    key={h}
                    className="text-[11px] px-1.5 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-zinc-700 font-mono"
                  >
                    {h.startsWith('#') ? h : `#${h}`}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-4">
              <Button
                type="button"
                onClick={sharpenImageComposition}
                disabled={isBusy}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {phase === 'sharpening'
                  ? 'Sharpening…'
                  : imageCompSharpened
                    ? '🔥 Re-sharpen with Ember'
                    : '🔥 Sharpen with Ember'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* UNIFIED SEND TO NOTION */}
      {hasSomethingToSend ? (
        <div className="rounded-xl border-2 border-zinc-300 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-zinc-900">
              Send to Notion → Pipeline → Blotato
            </h3>
            <span className="text-xs text-zinc-500">
              {mode === 'voice'
                ? '1 sharpened caption ready'
                : mode === 'fromImages'
                  ? `1 composition${useImageCompSharpened ? ' (Ember sharpened)' : ''} · ${fromImagesUrls.length} image${fromImagesUrls.length === 1 ? '' : 's'} attached`
                  : `${checked.size} idea${checked.size === 1 ? '' : 's'} selected`}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs text-zinc-600">Status</span>
              <select
                value={notionStatus}
                onChange={(e) => setNotionStatus(e.target.value as Status)}
                disabled={isBusy}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              >
                <option value="Planned">Planned (planner skips)</option>
                <option value="Idea">Idea (planner picks from)</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Published">Published</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-zinc-600">
                Scheduled date{' '}
                <span className="text-zinc-400">(optional)</span>
              </span>
              <Input
                type="date"
                value={notionScheduledDate}
                onChange={(e) => setNotionScheduledDate(e.target.value)}
                disabled={isBusy}
              />
            </label>
            {mode === 'fromImages' && fromImagesUrls.length > 0 ? (
              <p className="md:col-span-3 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                ℹ️ From Images mode: your {fromImagesUrls.length} composed
                slide{fromImagesUrls.length === 1 ? '' : 's'}{' '}
                {fromImagesUrls.length === 1 ? 'is' : 'are'} auto-attached as
                the carousel. The Drive-links textarea and upload button below
                are <strong>ignored</strong> in this mode — they exist for
                Voice / Brainstorm paths. To change slides, re-run From Images
                with new input.
              </p>
            ) : null}
            <label className="block">
              <span className="text-xs text-zinc-600">
                Drive links{' '}
                <span className="text-zinc-400">
                  (one URL per line — order = carousel slide order)
                </span>
              </span>
              <Textarea
                value={notionImageUrl}
                onChange={(e) => setNotionImageUrl(e.target.value)}
                placeholder={
                  'https://drive.google.com/file/d/<slide-1-id>/view\nhttps://drive.google.com/file/d/<slide-2-id>/view\nhttps://drive.google.com/file/d/<slide-3-id>/view'
                }
                rows={3}
                disabled={isBusy}
              />
            </label>
          </div>

          {/* Multi-image upload (carousel-friendly). */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-zinc-600">
                Images{' '}
                <span className="text-zinc-400">
                  (carousel slides — max 10)
                </span>
              </span>
              <label
                className={`text-xs px-2 py-1 rounded-md border border-zinc-300 cursor-pointer hover:border-zinc-500 hover:bg-zinc-50 transition ${
                  notionUploading || isBusy || notionImageUrls.length >= 10
                    ? 'opacity-50 pointer-events-none'
                    : ''
                }`}
              >
                {notionUploading
                  ? 'Uploading…'
                  : '📎 Upload images from device'}
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={handleNotionFileUpload}
                  disabled={
                    notionUploading || isBusy || notionImageUrls.length >= 10
                  }
                  className="hidden"
                />
              </label>
              {notionImageUrls.length > 0 ? (
                <span className="text-xs text-zinc-500">
                  {notionImageUrls.length} attached
                </span>
              ) : null}
            </div>
            {notionImageUrls.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {notionImageUrls.map((url, idx) => (
                  <div
                    key={url + idx}
                    className="relative group rounded-md overflow-hidden border border-zinc-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`upload ${idx + 1}`}
                      className="w-20 h-20 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeNotionImageAt(idx)}
                      disabled={isBusy}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-zinc-900/70 text-white text-xs flex items-center justify-center hover:bg-red-600 transition"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {notionUploadError ? (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                Upload failed: {notionUploadError}
              </p>
            ) : null}
          </div>

          {hashtagWarning ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠️ {hashtagWarning.count} hashtags
              {hashtagWarning.where ? ` in "${hashtagWarning.where}"` : ''} —
              Blotato/Instagram caps Instagram posts at 5. Trim the caption
              before sending, or the push-to-Blotato step will reject this row.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-zinc-500">
              {mode === 'brainstorm'
                ? 'Same status/date/Drive links apply to every selected idea.'
                : 'Caption used: '}
              {mode === 'voice' && voice.result?.fullPost
                ? 'full post (caption + hashtags inline)'
                : mode === 'voice'
                  ? 'sharpened caption only'
                  : ''}
            </p>
            <Button
              type="button"
              onClick={sendToNotion}
              disabled={isBusy}
            >
              {phase === 'sending'
                ? 'Sending…'
                : `Send to Notion (${
                    mode === 'voice' || mode === 'fromImages'
                      ? 1
                      : checked.size
                  })`}
            </Button>
          </div>
        </div>
      ) : null}

      {/* SEND SUCCESS */}
      {notionSendResult ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-100 p-5">
          <p className="text-sm font-semibold text-emerald-900">
            ✅ {notionSendResult.inserted} item
            {notionSendResult.inserted === 1 ? '' : 's'} sent to Notion
          </p>
          {notionSendResult.errors.length ? (
            <ul className="text-xs text-emerald-900 mt-2 space-y-1">
              {notionSendResult.errors.map((err, i) => (
                <li key={i}>• {err}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-emerald-800 mt-2">
            View on{' '}
            <a href="/scheduled-pipeline" className="underline">
              /scheduled-pipeline
            </a>{' '}
            (Status=Planned/Scheduled/Published only) or filter your Notion DB.
          </p>
        </div>
      ) : null}
    </div>
  )
}
