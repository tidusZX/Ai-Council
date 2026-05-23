import { createClient } from '@shaq-os/supabase-client/server'
import { listRowsByStatus } from '@/lib/notion'
import { PipelineList } from '@/components/pipeline/PipelineList'

export const metadata = { title: 'Scheduled Pipeline — AI Council' }
export const dynamic = 'force-dynamic'

export default async function ScheduledPipelinePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Not signed in.
      </div>
    )
  }

  let rows: Awaited<ReturnType<typeof listRowsByStatus>> = []
  let error: string | null = null
  try {
    rows = await listRowsByStatus(['Planned', 'Drafting'])
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Scheduled Pipeline</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Notion rows with Status="Planned" or "Drafting". Push to Blotato when
          you're happy with the caption and the Image column has the final
          asset URL.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          Failed to load Notion rows. {error}
        </div>
      ) : (
        <PipelineList initial={rows} />
      )}
    </div>
  )
}
