import { createClient } from '@shaq-os/supabase-client/server'
import type { Lead } from '@shaq-os/database-types'
import { LeadForm } from '@/components/leads/LeadForm'
import { LeadsList } from '@/components/leads/LeadsList'

export const metadata = { title: 'Leads — AI Council' }
export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  const initial = (error ? [] : data ?? []) as Lead[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Leads</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Drop a business + 6–12 images of their feed. Get back a visual-brand
          diagnosis and an outreach angle.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <LeadForm />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          Failed to load leads. {error.message}
        </div>
      ) : (
        <LeadsList initial={initial} />
      )}
    </div>
  )
}
