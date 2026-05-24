import { DiscoverWorkflow } from '@/components/leads/DiscoverWorkflow'

export const metadata = { title: 'Discover Leads — AI Council' }
export const dynamic = 'force-dynamic'

export default function DiscoverLeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Discover Leads</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Paste Instagram handles. Apify scrapes their recent posts. Each
          becomes a new lead in your funnel with the latest 12 post images
          ready for diagnosis. Maps-based discovery (category → SG businesses)
          ships in Phase 2.
        </p>
      </div>
      <DiscoverWorkflow />
    </div>
  )
}
