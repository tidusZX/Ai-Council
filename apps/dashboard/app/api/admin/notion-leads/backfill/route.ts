/**
 * POST /api/admin/notion-leads/backfill — push every lead in Supabase
 * that doesn't yet have a notion_page_id to the Notion Leads DB.
 *
 * Idempotent: a lead with notion_page_id set is skipped. Failures are
 * captured per-lead, the route doesn't abort on the first error.
 *
 * Body (optional): { limit?: number = 50 }  — cap one invocation so we
 * stay inside Vercel's 60s budget. Re-run until pending = 0.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import {
  notionLeadsConfigured,
  pushLeadsToNotion,
  type LeadForNotion,
} from '@/lib/notion-leads'

export const maxDuration = 60

const Body = z.object({
  limit: z.number().int().min(1).max(100).default(50),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (!notionLeadsConfigured()) {
    return NextResponse.json(
      { error: 'NOTION_LEADS_DATABASE_ID or NOTION_API_KEY not set' },
      { status: 503 }
    )
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  const limit = parsed.success ? parsed.data.limit : 50

  const { data: leads, error: queryErr } = await supabase
    .from('leads')
    .select(
      'id, business_name, ig_handle, website, location, discovery_source, discovery_metadata, diagnosis, opportunity_score, created_at, notion_page_id'
    )
    .eq('owner_id', user.id)
    .is('notion_page_id', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (queryErr) {
    return NextResponse.json(
      { error: 'lead query failed', message: queryErr.message },
      { status: 500 }
    )
  }
  if (!leads || leads.length === 0) {
    return NextResponse.json({
      ok: true,
      pending: 0,
      pushed: 0,
      failed: 0,
      message: 'nothing to backfill',
    })
  }

  const toPush: LeadForNotion[] = leads.map((r) => ({
    id: r.id,
    business_name: r.business_name,
    ig_handle: r.ig_handle ?? null,
    website: r.website ?? null,
    location: r.location ?? null,
    discovery_source: r.discovery_source ?? null,
    discovery_metadata:
      (r.discovery_metadata as Record<string, unknown> | null) ?? null,
    diagnosis: (r.diagnosis as Record<string, unknown> | null) ?? null,
    opportunity_score: r.opportunity_score ?? null,
    created_at: r.created_at,
  }))

  const results = await pushLeadsToNotion(toPush)

  let pushed = 0
  let failed = 0
  const failures: { leadId: string; error?: string }[] = []
  for (const result of results) {
    if (result.notionPageId) {
      pushed += 1
      await supabase
        .from('leads')
        .update({ notion_page_id: result.notionPageId })
        .eq('id', result.leadId)
        .eq('owner_id', user.id)
    } else {
      failed += 1
      failures.push({ leadId: result.leadId, error: result.error })
    }
  }

  // Count what's still pending after this batch so the caller knows
  // whether to re-run.
  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .is('notion_page_id', null)

  return NextResponse.json({
    ok: failed === 0,
    pushed,
    failed,
    failures: failures.slice(0, 5),
    pendingAfter: count ?? null,
  })
}
