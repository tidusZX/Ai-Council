import { createClient } from '@shaq-os/supabase-client/server'
import Link from 'next/link'
import { SessionCard } from '@/components/dashboard/SessionCard'
import { Button } from '@/components/ui/Button'

export const metadata = { title: 'Dashboard — AI Council' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Council Sessions</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {sessions?.length
              ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`
              : 'No sessions yet'}
          </p>
        </div>
        <Link href="/sessions/new">
          <Button>New session</Button>
        </Link>
      </div>

      {/* Sessions list */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          Failed to load sessions. Please refresh.
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-zinc-200 p-12 text-center">
          <span className="text-4xl block mb-4">👑</span>
          <h3 className="font-semibold text-zinc-900 mb-2">No sessions yet</h3>
          <p className="text-sm text-zinc-500 mb-6">
            Submit a question, idea, or decision to convene your first council.
          </p>
          <Link href="/sessions/new">
            <Button>Start your first session</Button>
          </Link>
        </div>
      )}
    </div>
  )
}
