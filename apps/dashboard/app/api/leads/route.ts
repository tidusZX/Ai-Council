import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@shaq-os/supabase-client/server'
import type { Json } from '@shaq-os/database-types'

const ANALYSIS_SERVICE_URL =
  process.env.ANALYSIS_SERVICE_URL ?? 'http://localhost:3002'
const ANALYSIS_API_KEY = process.env.ANALYSIS_API_KEY ?? ''

const CreateBodySchema = z.object({
  business_name: z.string().min(1).max(200),
  business_type: z.string().max(100).optional(),
  ig_handle: z.string().max(100).optional(),
  website: z.url().optional(),
  location: z.string().max(200).optional(),
  image_urls: z.array(z.url()).min(1).max(12).optional(),
})

/**
 * POST /api/leads
 * Create a new lead. If `image_urls` provided, also runs diagnosis
 * synchronously and stores the result.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const parsed = CreateBodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: z.treeifyError(parsed.error) },
      { status: 400 }
    )
  }
  const { image_urls, ...leadInput } = parsed.data

  let diagnosis: Record<string, unknown> | null = null
  let opportunity_score: number | null = null

  if (image_urls && image_urls.length) {
    try {
      const res = await fetch(`${ANALYSIS_SERVICE_URL}/diagnose-lead`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANALYSIS_API_KEY,
        },
        body: JSON.stringify({
          business_name: leadInput.business_name,
          business_type: leadInput.business_type,
          image_urls,
        }),
      })
      const body = (await res.json().catch(() => null)) as
        | { diagnosis?: Record<string, unknown>; error?: string; message?: string }
        | null
      if (!res.ok || !body?.diagnosis) {
        return NextResponse.json(
          {
            error: 'diagnosis failed',
            status: res.status,
            details: body,
          },
          { status: 502 }
        )
      }
      diagnosis = body.diagnosis
      const raw = (diagnosis as { overall_opportunity_score?: unknown })
        .overall_opportunity_score
      if (typeof raw === 'number' && raw >= 0 && raw <= 100) {
        opportunity_score = raw
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return NextResponse.json(
        { error: 'analysis-service unreachable', message },
        { status: 502 }
      )
    }
  }

  const { data: lead, error: insertError } = await supabase
    .from('leads')
    .insert({
      owner_id: user.id,
      business_name: leadInput.business_name,
      ig_handle: leadInput.ig_handle ?? null,
      website: leadInput.website ?? null,
      location: leadInput.location ?? null,
      opportunity_score,
      diagnosis: (diagnosis ?? {}) as Json,
      status: 'new',
    })
    .select()
    .single()

  if (insertError || !lead) {
    return NextResponse.json(
      { error: 'failed to insert lead', message: insertError?.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ lead })
}

/**
 * GET /api/leads
 * List the user's leads, sorted by opportunity_score desc, nulls last.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('owner_id', user.id)
    .order('opportunity_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json(
      { error: 'failed to list leads', message: error.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ leads: leads ?? [] })
}
