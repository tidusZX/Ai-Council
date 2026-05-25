/**
 * POST /api/leads/[id]/push-to-notion — debug + manual retry.
 *
 * Re-runs the Notion push for a single existing lead and returns the
 * raw PushResult. Useful when the auto-push fails silently and we want
 * to see the actual Notion API error.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@shaq-os/supabase-client/server'
import {
  notionLeadsConfigured,
  pushLeadToNotion,
  type LeadForNotion,
} from '@/lib/notion-leads'

export const maxDuration = 30

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  if (!notionLeadsConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        diagnostic: 'NOTION_API_KEY or NOTION_LEADS_DATABASE_ID not set on this deployment',
        env: {
          hasApiKey: Boolean(process.env.NOTION_API_KEY),
          hasLeadsDbId: Boolean(process.env.NOTION_LEADS_DATABASE_ID),
        },
      },
      { status: 503 }
    )
  }

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select(
      'id, business_name, ig_handle, website, location, discovery_source, discovery_metadata, diagnosis, opportunity_score, created_at, notion_page_id'
    )
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()
  if (leadErr || !lead) {
    return NextResponse.json({ error: 'lead not found' }, { status: 404 })
  }

  const leadForNotion: LeadForNotion = {
    id: lead.id,
    business_name: lead.business_name,
    ig_handle: lead.ig_handle ?? null,
    website: lead.website ?? null,
    location: lead.location ?? null,
    discovery_source: lead.discovery_source ?? null,
    discovery_metadata:
      (lead.discovery_metadata as Record<string, unknown> | null) ?? null,
    diagnosis: (lead.diagnosis as Record<string, unknown> | null) ?? null,
    opportunity_score: lead.opportunity_score ?? null,
    created_at: lead.created_at,
  }

  const result = await pushLeadToNotion(leadForNotion)
  if (result.notionPageId) {
    await supabase
      .from('leads')
      .update({ notion_page_id: result.notionPageId })
      .eq('id', id)
      .eq('owner_id', user.id)
  }

  return NextResponse.json({
    ok: Boolean(result.notionPageId),
    result,
    env: {
      hasApiKey: Boolean(process.env.NOTION_API_KEY),
      hasLeadsDbId: Boolean(process.env.NOTION_LEADS_DATABASE_ID),
      // safe to expose: just the suffix (last 8 chars) so user can verify
      // it matches what they set, without leaking the full ID
      leadsDbIdTail: process.env.NOTION_LEADS_DATABASE_ID?.slice(-8) ?? null,
    },
  })
}
