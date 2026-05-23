import { BrainstormWorkflow } from '@/components/brainstorm/BrainstormWorkflow'

export const metadata = { title: 'Brainstorm — AI Council' }
export const dynamic = 'force-dynamic'

export default function BrainstormPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Brainstorm</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Two lenses. <strong>Audience Signal</strong> finds ICP pain points
          and brainstormable angles. <strong>Brainstorm</strong> turns a topic
          into N postable ideas in your voice. Sharpen any selection with
          Ember before writing to Notion as Status="Idea".
        </p>
      </div>
      <BrainstormWorkflow />
    </div>
  )
}
