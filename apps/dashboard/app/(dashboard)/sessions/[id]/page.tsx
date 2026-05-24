import { createClient } from '@shaq-os/supabase-client/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CouncilSession } from '@/components/council/CouncilSession'
import { RoundsThread } from '@/components/council/RoundsThread'
import { PostingPlanCard } from '@/components/planner/PostingPlanCard'
import { formatDate } from '@/lib/utils'
import type { Message } from '@shaq-os/database-types'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('sessions').select('title').eq('id', id).single()
  return { title: data ? `${data.title} — AI Council` : 'Session — AI Council' }
}

export default async function SessionPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (sessionError || !session) notFound()

  const { data: messages } = await supabase
    .from('messages')
    .select('id, session_id, role, content, is_complete, created_at, updated_at, embedding')
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  const { data: discussions } = await supabase
    .from('council_outputs')
    .select('id, payload, created_at')
    .eq('session_id', id)
    .eq('kind', 'other')
    .order('created_at', { ascending: true })

  const { data: postingPlans } = await supabase
    .from('council_outputs')
    .select('id, payload, created_at')
    .eq('session_id', id)
    .eq('kind', 'posting_plan')
    .order('created_at', { ascending: false })
    .limit(1)
  const postingPlan = postingPlans?.[0] ?? null

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/dashboard" className="hover:text-zinc-900 transition-colors">
          Sessions
        </Link>
        <span>/</span>
        <span className="text-zinc-900 font-medium line-clamp-1">{session.title}</span>
      </div>

      {/* Session meta */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 line-clamp-2">
            {session.title}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">{formatDate(session.created_at)}</p>
        </div>
        <Link
          href="/sessions/new"
          className="shrink-0 text-sm text-zinc-500 hover:text-zinc-900 border border-zinc-200 hover:border-zinc-400 rounded-lg px-3 py-2 transition-all"
        >
          New session
        </Link>
      </div>

      {/* Attached images (Plan 07). Empty array → renders nothing. */}
      {((session as { image_urls?: string[] }).image_urls ?? []).length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
            Attached images · the council sees these
          </p>
          <div className="flex flex-wrap gap-3">
            {((session as { image_urls?: string[] }).image_urls ?? []).map(
              (url, i) => (
                <a
                  key={url + i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-24 h-24 rounded-md overflow-hidden border border-zinc-200 hover:border-zinc-400 transition"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`attachment ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                </a>
              )
            )}
          </div>
        </div>
      ) : null}

      {postingPlan ? (
        <>
          <PostingPlanCard payload={postingPlan.payload} enableDiscuss />
          <RoundsThread
            sessionId={session.id}
            allMessages={(messages ?? []) as Message[]}
          />
        </>
      ) : (
        /* The actual council session with streaming (only if not a planning session) */
        <CouncilSession
          session={session}
          initialMessages={messages ?? []}
          initialDiscussions={discussions ?? []}
        />
      )}
    </div>
  )
}
