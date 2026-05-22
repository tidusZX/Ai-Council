import { createClient } from '@shaq-os/supabase-client/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

async function LogoutButton() {
  return (
    <form action="/api/auth/logout" method="POST">
      <button
        type="submit"
        className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        Sign out
      </button>
    </form>
  )
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-bold text-zinc-900 text-base">
              AI Council
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Sessions
            </Link>
            <Link
              href="/references/analyze"
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Analyze Videos
            </Link>
            <Link
              href="/leads"
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Leads
            </Link>
            <Link
              href="/planner"
              className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              Planner
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-400 hidden sm:block">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  )
}
