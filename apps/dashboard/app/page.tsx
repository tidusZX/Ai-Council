import Link from 'next/link'
import { COUNCIL_MEMBERS, CHAIRPERSON } from '@/lib/ai/council-members'

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <span className="font-bold text-lg tracking-tight">AI Council</span>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="text-sm text-zinc-400 hover:text-white transition-colors px-4 py-2"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-white text-zinc-900 font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-3 py-1.5 mb-8">
          <span>👑</span> Powered by Claude
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
          Every decision deserves<br />
          <span className="text-zinc-400">a full council.</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Submit any question, idea, or business decision. Five expert AI advisors respond from different angles — then the Chairperson synthesizes it into a clear recommendation.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 bg-white text-zinc-900 font-semibold px-8 py-3.5 rounded-xl text-base hover:bg-zinc-100 transition-colors"
        >
          Convene your council →
        </Link>
      </section>

      {/* Council preview */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {COUNCIL_MEMBERS.map((member) => (
            <div
              key={member.role}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-center gap-3"
            >
              <span className="text-2xl">{member.icon}</span>
              <div>
                <p className="text-sm font-semibold text-white">{member.name}</p>
                <p className="text-xs text-zinc-500">{member.title}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border-2 border-amber-600/40 bg-amber-950/30 p-4 flex items-center gap-3">
          <span className="text-2xl">{CHAIRPERSON.icon}</span>
          <div>
            <p className="text-sm font-bold text-amber-400">{CHAIRPERSON.name}</p>
            <p className="text-xs text-zinc-500">{CHAIRPERSON.title} — synthesizes all perspectives into a final recommendation</p>
          </div>
        </div>
      </section>
    </main>
  )
}
