'use client'

import { useState } from 'react'
import type { Lead } from '@shaq-os/database-types'
import { LeadCard } from './LeadCard'

export function LeadsList({ initial }: { initial: Lead[] }) {
  const [leads] = useState<Lead[]>(initial)

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 p-12 text-center">
        <p className="text-sm text-zinc-500">
          No leads yet. Add your first one above — paste a Singapore business
          name plus a handful of their IG/website images and Claude will score
          the opportunity.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">
          {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
        </h2>
        <p className="text-xs text-zinc-400">Sorted by opportunity score</p>
      </div>
      {leads.map((lead) => (
        <LeadCard key={lead.id} lead={lead} />
      ))}
    </div>
  )
}
