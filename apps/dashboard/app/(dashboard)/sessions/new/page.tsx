import { PromptForm } from '@/components/council/PromptForm'

export const metadata = { title: 'New Session — AI Council' }

export default function NewSessionPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">New Council Session</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Describe your question, idea, or decision below. The council will respond from five expert perspectives.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <PromptForm />
      </div>

      {/* Council preview */}
      <div className="rounded-xl bg-zinc-900 text-white p-5">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">
          Your council
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {[
            { icon: '♟️', name: 'Strategist' },
            { icon: '🎨', name: 'Creative Director' },
            { icon: '⚙️', name: 'Technical Producer' },
            { icon: '📣', name: 'Marketing Lead' },
            { icon: '🔍', name: 'Critic' },
            { icon: '👑', name: 'Chairperson' },
          ].map(({ icon, name }) => (
            <div key={name} className="flex items-center gap-2 text-zinc-300">
              <span>{icon}</span>
              <span className="text-xs">{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
