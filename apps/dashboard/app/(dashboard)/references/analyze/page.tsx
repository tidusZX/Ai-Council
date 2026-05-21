import { createClient } from '@shaq-os/supabase-client/server'
import type { VideoAnalysis } from '@shaq-os/database-types'
import { AnalyzeForm } from '@/components/references/AnalyzeForm'
import { AnalysesList } from '@/components/references/AnalysesList'

export const metadata = { title: 'Analyze Videos — AI Council' }

// Always render fresh on each navigation; the client-side poll handles
// in-page updates.
export const dynamic = 'force-dynamic'

export default async function AnalyzePage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('video_analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  const initial = (error ? [] : data ?? []) as VideoAnalysis[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Analyze Videos</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste a viral URL → 90 seconds later, structured analysis of why it
          works.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <AnalyzeForm />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          Failed to load existing analyses. {error.message}
        </div>
      ) : (
        <AnalysesList initial={initial} />
      )}
    </div>
  )
}
