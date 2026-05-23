/**
 * POST /api/leads/[id]/status — Codex task 03
 *
 * Update a lead's status through the funnel.
 * Auth-checked + owner-scoped. Status validated against the CHECK enum
 * defined in migration 003.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'

export const maxDuration = 15

const STATUSES = [
  'new',
  'qualified',
  'contacted',
  'responded',
  'won',
  'lost',
  'archived',
] as const

const Body = z.object({
  status: z.enum(STATUSES),
})

export async function POST(
  req: Request,
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

  const parsed = Body.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }

  // Owner-scoped update — returns null if the row doesn't exist OR the
  // user doesn't own it (RLS scopes by owner_id). Matches the 404 pattern
  // used by /api/leads/[id]/draft-outreach.
  const { data, error } = await supabase
    .from('leads')
    .update({ status: parsed.data.status })
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: 'lead not found or update failed', details: error?.message },
      { status: 404 }
    )
  }

  return NextResponse.json({ ok: true, lead: data })
}
