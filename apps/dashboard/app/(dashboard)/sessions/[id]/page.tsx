import { createClient } from '@shaq-os/supabase-client/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CouncilSession } from '@/components/council/CouncilSession'
import { formatDate } from '@/lib/utils'

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

      {/* The actual council session with streaming */}
      <CouncilSession session={session} initialMessages={messages ?? []} />
    </div>
  )
}
