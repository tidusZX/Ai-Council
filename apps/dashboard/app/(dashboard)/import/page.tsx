import { ImportWorkflow } from '@/components/import/ImportWorkflow'

export const metadata = { title: 'Import — AI Council' }
export const dynamic = 'force-dynamic'

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Import existing</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Add carousels or posts you've already designed (or already published)
          straight into the Notion calendar without running the planner. Set
          Status="Planned" so the planner skips them on its next run.
        </p>
      </div>
      <ImportWorkflow />
    </div>
  )
}
