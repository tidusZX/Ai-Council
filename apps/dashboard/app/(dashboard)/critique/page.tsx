import { CritiqueWorkflow } from '@/components/critique/CritiqueWorkflow'

export const metadata = { title: 'Critique — AI Council' }
export const dynamic = 'force-dynamic'

export default function CritiquePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Critique</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Photo Qualifier ideas waiting to be reviewed. Click "Critique with
          Council" on any card to spawn a Council session pre-filled with the
          idea + its primary image — five members weigh in, Chairperson
          synthesizes, you decide whether to post.
        </p>
      </div>
      <CritiqueWorkflow />
    </div>
  )
}
