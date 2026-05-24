import { ComposeWorkflow } from '@/components/compose/ComposeWorkflow'

export const metadata = { title: 'Compose — AI Council' }
export const dynamic = 'force-dynamic'

export default function ComposePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Compose</h1>
        <p className="text-sm text-zinc-500 mt-1">
          One page, three modes:
          <strong> Brainstorm</strong> (topic → N ideas),{' '}
          <strong>Audience Signal</strong> (ICP research → angles), and{' '}
          <strong>Voice</strong> (paste a draft → Ember sharpens it). Send to
          Notion at the end of any path with status, date, and Drive link in
          one form.
        </p>
      </div>
      <ComposeWorkflow />
    </div>
  )
}
