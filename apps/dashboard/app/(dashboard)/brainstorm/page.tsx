import { BrainstormWorkflow } from '@/components/brainstorm/BrainstormWorkflow'

export const metadata = { title: 'Brainstorm — AI Council' }
export const dynamic = 'force-dynamic'

export default function BrainstormPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Brainstorm</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Topic in → N fresh post ideas out, written in your voice. Check the
          ones worth keeping → they land in Notion as Status="Idea", ready to
          schedule or drop into a Planner run.
        </p>
      </div>
      <BrainstormWorkflow />
    </div>
  )
}
