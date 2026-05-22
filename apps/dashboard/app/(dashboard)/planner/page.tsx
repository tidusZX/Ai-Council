import Link from 'next/link'
import { PlannerWorkflow } from '@/components/planner/PlannerWorkflow'

export const metadata = { title: 'Planner — AI Council' }
export const dynamic = 'force-dynamic'

export default function PlannerPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Content Planner</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Pulls "Idea" status posts from your Notion DB, runs the Content
          Planner persona against them with the Council's scoring rubric, and
          gives you the 10 best for the month. Approve to write back to Notion
          with Status="Planned".
        </p>
        <p className="text-xs text-zinc-400 mt-2">
          Want to inspect prior plans? They live as{' '}
          <Link href="/dashboard" className="underline hover:text-zinc-900">
            Council sessions
          </Link>{' '}
          tagged "Content plan — …".
        </p>
      </div>

      <PlannerWorkflow />
    </div>
  )
}
